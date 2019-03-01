const util = require('util')

// private property names
const pEmitter    = Symbol('emitter')
const pNext       = Symbol('next')
const pError      = Symbol('error')
const pComplete   = Symbol('complete')
const pStartCb    = Symbol('startCb')
const pNextCb     = Symbol('nextCb')
const pErrorCb    = Symbol('errorCb')
const pCompleteCb = Symbol('completeCb')

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
  constructor(emitter, startCb, nextCb, errorCb, completeCb) {
    let isClosed = false
    let cleanup = () => isClosed = true

    class S {
      constructor(startCb, nextCb, errorCb, completeCb) {
        this.constructor = Object // wtf even is this?
        this[pStartCb]    = startCb
        this[pNextCb]     = nextCb
        this[pErrorCb]    = errorCb
        this[pCompleteCb] = completeCb
      }
      next(val) {
        if(isClosed) return
        try { return nextCb(val) }
        catch(err) {
          cleanup()
          throw err
        }
      }
      error(err) {
        if(isClosed) throw err
        cleanup()
        return errorCb(err, throwFn)
      }
      complete(val) {
        if(isClosed) return val
        cleanup()
        return completeCb(val)
      }
      get closed() {
        return isClosed
      }
      unsubscribe() {
        return isClosed || cleanup()
      }
    }
    const prototype = S.prototype
    const subscription = new S(startCb, nextCb, errorCb, completeCb)

    let tmp

    try {
      startCb(subscription)
      if(!isClosed) tmp = emitter(subscription)
    } catch(e) {
      errorCb(e, throwFn)
    }

    if('object' === typeof tmp && tmp !== null && 'function' === typeof tmp.unsubscribe) {
      const subscription = tmp
      tmp = () => subscription.unsubscribe()
    }

    if('function' !== typeof tmp && tmp !== null && tmp !== undefined)
      throw new TypeError(`Invalid cleanup function: ${inspect(tmp)}`)

    if(tmp)
      cleanup = () => {
        isClosed = true
        try { tmp() } catch(e) { }
      }

    if(isClosed)
      cleanup()

    return subscription
  }
}

function delegate(obj, fnName, desc = fnName) {
  let fn, dneImpl
  return (arg, ifDneRunThis) => {
    dneImpl = (ifDneRunThis || noopFn)
    if(!fn) {
      let candidateFn = obj[fnName]
      if(candidateFn === null || candidateFn == undefined)
        candidateFn = (arg) => dneImpl(arg)
      if('function' === typeof candidateFn)
        fn = candidateFn
      else
        fn = () => {
          throw new TypeError(`${inspect(obj)}.${fnName} should be the ${desc} function, instead its ${inspect(candidateFn)}`)
        }
    }
    return fn.call(obj, arg)
  }
}

class MyObservable {
  constructor(emitter) {
    if("function" !== typeof emitter)
      throw new TypeError("First arg must be callable")
    this[pEmitter] = emitter
  }

  subscribe(observer) {
    let startCb, nextCb, errorCb, completeCb
    if('function' === typeof observer) {
      startCb    = noopFn
      nextCb     = delegate(arguments, 0, 'next')
      errorCb    = delegate(arguments, 1, 'error')
      completeCb = delegate(arguments, 2, 'complete')
    } else if ('object' === typeof observer && observer) {
      startCb    = delegate(observer, 'start')
      nextCb     = delegate(observer, 'next')
      errorCb    = delegate(observer, 'error')
      completeCb = delegate(observer, 'complete')
    } else {
      throw new TypeError("Observer arg must be an object or the onNext function")
    }

    return new Subscription(this[pEmitter], startCb, nextCb, errorCb, completeCb)
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
