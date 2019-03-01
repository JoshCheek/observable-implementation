const util = require('util')

const pEmitter   = Symbol('emitter')
const pNext      = Symbol('next')
const pError     = Symbol('error')
const pComplete  = Symbol('complete')

const noopFn  = (val) => {}
const throwFn = (err) => { throw err }

function inspect(val) {
  return util.inspect(val, { colors: true })
}

function log(...args) {
  args.forEach(arg => {
    if('string' === typeof arg)
      arg = `\x1b[35m${arg}\x1b[0m`
    else
      arg = inspect(arg)
    console.log(arg)
  })
}

Symbol.observable = Symbol.for("observable")

class Subscription {
  constructor(emitter, observer) {
    let isClosed = false

    if(!observer || !('object' === typeof observer || 'function' === typeof observer) )
      throw new TypeError("Observer arg must be an object or the onNext function")

    if('function' === typeof observer)
      observer = {
        next:     arguments[1],
        error:    arguments[2],
        complete: arguments[3],
      }

    let needsCleanup = false
    let cleanup = () => {
      // log('cleanup')
      needsCleanup = true
      isClosed = true
    }

    const prototype = new Object()
    const THIS2 = Object.create(prototype)
    Object.defineProperty(prototype, 'next', {
      enumerable:   false,
      writable:     true,
      configurable: true,
      value:        (val) => {
        if(!THIS2.closed && !needsCleanup) {
          const next = observer.next
          if(next)
            try { return next(val) }
            catch(nextError) {
              try { cleanup() }
              catch(cleanupError) { }
              throw nextError
            }
        }
      },
    })
    Object.defineProperty(prototype, 'error', {
      writable:     true,
      configurable: true,
      value:        (err) => {
        const closed = THIS2.closed
        try { cleanup() } catch(e) { }
        if(closed) throw err
        const errorFn = observer.error
        if(errorFn)
          return errorFn(err)
        throw err
      },
    })
    Object.defineProperty(prototype, 'complete', {
      writable:     true,
      configurable: true,
      value:        (val) => {
        if(THIS2.closed)
          try { return val } catch(e) { }
        isClosed = true
        try { cleanup() } catch(e) { }
        const completeFn = observer.complete
        if(completeFn)
          return completeFn(val)
      }
    })
    Object.defineProperty(prototype, 'closed', {
      configurable: true,
      get: () => isClosed
    })
    Object.defineProperty(prototype, 'unsubscribe', {
      writable:     true,
      configurable: true,
      value:        () => {
        if(isClosed) return
        isClosed = true
        cleanup()
      }
    })

    let tmp

    try {
      if(observer.start)
        observer.start(THIS2)

      if(THIS2.closed)
        return

      tmp = emitter(THIS2)
    } catch(e) {
      if('error' in observer)
        observer.error(e)
      else
        throw e
      return
    }

    if('object' === typeof tmp && tmp !== null && 'function' === typeof tmp.unsubscribe) {
      const subscription = tmp
      tmp = () => subscription.unsubscribe()
    }

    if('function' !== typeof tmp && tmp !== null && tmp !== undefined)
      throw new TypeError(`Invalid cleanup function: ${inspect(tmp)}`)

    cleanup = (tmp || cleanup)

    if(needsCleanup)
      cleanup()

    return THIS2
  }
}

class MyObservable {
  constructor(emitter) {
    if("function" !== typeof emitter)
      throw new TypeError("First arg must be callable")
    this[pEmitter] = emitter
  }

  subscribe(observer) {
    return new Subscription(this[pEmitter], ...arguments)
  }

  [Symbol.observable]() {
    return this
  }

  static of(...items) {
    let klass = this
    if('function' !== typeof klass)
      klass = MyObservable

    return new klass(({ next, complete }) => {
      for(let item of items)
        next(item)
      complete()
    })
  }

  static from(toConvert) {
    let Observable = this
    if('function' !== typeof Observable)
      Observable = MyObservable

    if(Symbol.observable in toConvert) {
      const observable = toConvert[Symbol.observable]()
      if('subscribe' in observable)
        return new Observable(observable.subscribe)
      return observable
    }

    return new Observable(({ next, complete }) => {
      for(let element of toConvert)
        next(element)
      complete()
    })
  }

}

require("es-observable-tests").runTests(MyObservable);
