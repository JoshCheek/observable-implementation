const util = require('util')

const pEmitter   = Symbol('emitter')
const pClosed    = Symbol('closed')
const pCleanupFn = Symbol('cleanupFn')
const pNext      = Symbol('next')
const pError     = Symbol('error')
const pComplete  = Symbol('complete')
const pObserver  = Symbol('observer')

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
    this.constructor = Object // fkn whatever...
    this[pClosed]    = false
    this[pObserver]  = observer

    if(!observer || !('object' === typeof observer || 'function' === typeof observer) )
      throw new TypeError("Observer arg must be an object or the onNext function")

    if('function' === typeof observer) {
      const { 1: onNext, 2: onError, 3: onComplete } = arguments
      observer = {
        next:     onNext,
        error:    onError,
        complete: onComplete,
      }
    }

    let needsCleanup = false
    let cleanup = () => {
      // log('cleanup')
      needsCleanup = true
      this[pClosed] = true
    }
    this[pCleanupFn] = cleanup

    let tmp
    try {
      if(observer.start)
        observer.start(this)

      if(this.closed)
        return

      const prototype = new Object()
      Object.defineProperty(prototype, 'next', {
        enumerable:   false,
        writable:     true,
        configurable: true,
        value:        (val) => {
          if(!this.closed && !needsCleanup) {
            const next = observer.next
            if(next)
              try { return next(val) }
              catch(nextError) {
                try { this[pCleanupFn]() }
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
          const closed = this.closed
          try { this[pCleanupFn]() } catch(e) { }
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
          if(this.closed)
            try { return val } catch(e) { }
          this[pClosed] = true
          try { this[pCleanupFn]() } catch(e) { }
          const completeFn = observer.complete
          if(completeFn)
            return completeFn(val)
        }
      })
      tmp = emitter(Object.create(prototype))
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

    this[pCleanupFn] = (tmp || this[pCleanupFn])

    if(needsCleanup)
      this[pCleanupFn]()
  }

  unsubscribe() {
    if(this[pClosed]) return
    this[pClosed] = true
    this[pCleanupFn]()
  }

  get closed() {
    return this[pClosed]
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

//     observer.start    = (observer.start    || noopFn)
//     observer.next     = (observer.next     || noopFn)
//     observer.error    = (observer.error    || throwFn)
//     observer.complete = (observer.complete || noopFn)

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
