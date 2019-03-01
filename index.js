const util = require('util')

// private property names
const pEmitter    = Symbol('emitter')
const pEmitterCb  = Symbol('emitterCb')
const pStartCb    = Symbol('startCb')
const pNextCb     = Symbol('nextCb')
const pErrorCb    = Symbol('errorCb')
const pCompleteCb = Symbol('completeCb')
const pCleanup    = Symbol('cleanup')
const pIsClosed   = Symbol('closed?')

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
  constructor(emitterCb, startCb, nextCb, errorCb, completeCb) {
    this.constructor  = Object // wtf even is this?
    this[pEmitterCb]  = emitterCb
    this[pStartCb]    = startCb
    this[pNextCb]     = nextCb
    this[pErrorCb]    = errorCb
    this[pCompleteCb] = completeCb
    this.next         = this.next.bind(this)
    // this.error        = this.error.bind(this) // tests don't fail when I leave this commented out
    this.complete     = this.complete.bind(this)
    this.unsubscribe  = this.unsubscribe.bind(this)
    this[pIsClosed]   = false

    const subscription = this

    startCb(subscription)

    let cleanupCb
    if(!subscription.closed)
      try { cleanupCb = this[pEmitterCb](subscription) }
      catch(e) { errorCb(e, throwFn) }

    if('object' === typeof cleanupCb && cleanupCb !== null && 'function' === typeof cleanupCb.unsubscribe)
      cleanupCb = cleanupCb.unsubscribe

    if(cleanupCb === null || cleanupCb === undefined)
      cleanupCb = noopFn

    if('function' !== typeof cleanupCb)
      throw new TypeError(`Invalid cleanup function: ${inspect(cleanupCb)}`)

    subscription[pCleanup] = () => {
      subscription[pIsClosed] = true
      try { cleanupCb() } catch(e) { }
    }

    if(subscription.closed)
      subscription[pCleanup]()

    return subscription
  }

  get closed() {
    return this[pIsClosed]
  }

  [pCleanup]() {
    this[pIsClosed] = true
  }

  next(val) {
    if(this.closed) return
    try { return this[pNextCb](val) }
    catch(err) {
      this[pCleanup]()
      throw err
    }
  }

  error(err) {
    if(this.closed) throw err
    this[pCleanup]()
    return this[pErrorCb](err, throwFn)
  }

  complete(val) {
    if(this.closed) return val
    this[pCleanup]()
    return this[pCompleteCb](val)
  }

  unsubscribe() {
    return this.closed || this[pCleanup]()
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
