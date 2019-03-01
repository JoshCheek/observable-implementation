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

Symbol.observable = Symbol.for("observable")

class Subscription {
  constructor(emitter, observer) {
    this.constructor = Object // fkn whatever...
    this[pClosed]    = false
    this[pObserver]  = observer
    // this[pNext]      = nextFn
    // this[pError]     = errorFn
    // this[pComplete]  = completeFn

    // { start: startFn,
    //     next: nextFn,
    //     error: errorFn,
    //     complete: completeFn
    // }

    let needsCleanup = false
    let cleanup = function() { needsCleanup = true }
    this[pCleanupFn] = cleanup

    let tmp
    try {
      if(observer.start)
        observer.start(this)

      if(this.closed)
        return

      tmp = emitter({
        next: function(val) {
          if(observer.next) observer.next(val)
        },
        error: function(err) {
          cleanup()
          if(observer.error) observer.error(err)
          else throw err
        },
        complete: function(val) {
          cleanup()
          if(observer.complete) observer.complete(val)
        }
      })
    } catch(e) {
      ;(observer.error || throwFn)(e)
      return
    }

    if('object' === typeof tmp && tmp !== null && 'function' === typeof tmp.unsubscribe) {
      const subscription = tmp
      tmp = () => subscription.unsubscribe()
    }

    if('function' !== typeof tmp && tmp !== null && tmp !== undefined)
      throw new TypeError(`Invalid cleanup function: ${inspect(tmp)}`)

    this[pCleanupFn] = cleanup = (tmp || noopFn)

    if(needsCleanup)
      cleanup()
  }

  unsubscribe() {
    if(this[pClosed]) return
    this[pCleanupFn]()
    this[pClosed] = true
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
    if(!observer || !('object' === typeof observer || 'function' === typeof observer) )
      throw new TypeError("First arg must be an object or the onNext function")

    if('function' === typeof observer) {
      const { 0: onNext, 1: onError, 2: onComplete } = arguments
      observer = {
        next:     onNext,
        error:    onError,
        complete: onComplete,
      }
    }
    return new Subscription(this[pEmitter], observer)

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

  static from(arg) {
    if(arg === null || arg === undefined)
      throw new TypeError(`First arg can't be null or undefined for some reason`)

    if(Symbol.observable in arg) {
      const observable = arg[Symbol.observable]
      if('function' === typeof observable) {
        const returned = observable()
        if(('function' !== typeof returned && 'object' !== typeof returned) || returned === null)
          throw new TypeError(`Symbol.observable must return an object for some reason`)
        if('function' === typeof returned) {
          if(this === returned.constructor) {
            console.log("IS CONSTRUCTOR", returned)
            return returned
          } else {
            console.log("IS NOT CONSTRUCTOR")
            const returned2 = new returned()
            return returned2
          }
          return observable
        }
      } else {
        throw new TypeError(`Symbol.observable must be a function`)
      }
    }

    let klass = this
    if('function' !== typeof klass)
      klass = MyObservable


    return new klass(() => {
    })
  }
}

require("es-observable-tests").runTests(MyObservable);
