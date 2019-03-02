const util = require('util')

// private property names
const pEmitterCb  = Symbol('emitterCb')
const pNextCb     = Symbol('nextCb')
const pErrorCb    = Symbol('errorCb')
const pCompleteCb = Symbol('completeCb')
const pCleanupCb  = Symbol('cleanupCb')
const pIsClosed   = Symbol('closed?')

// helper functions
const noopFn  = (val) => {}
const throwFn = (err) => { throw err }
const typeErr = (msg) => throwFn(new TypeError(msg))
const inspect = (val) => util.inspect(val, { colors: true })
const isFn    = (fn)  => 'function' === typeof fn
const isStr   = (str) => 'string'   === typeof str
const isNull  = (obj) => null       === obj
const isUndef = (obj) => undefined  === obj
const isBlank = (obj) => isNull(obj) || isUndef(obj)
const isObj   = (obj) => obj && 'object' === typeof obj
const red     = (str) => `\x1b[31m${str}`
const green   = (str) => `\x1b[32m${str}`
const yellow  = (str) => `\x1b[33m${str}`
const magenta = (str) => `\x1b[35m${str}`
const nocolor = ()    => `\x1b[0m`

const log = (...args) =>
  // print strings in magenta and inspects/highlights non-strings
  args.forEach(arg => console.log(
    isStr(arg) ? magenta(arg) + nocolor() : inspect(arg)
  ))

const constructorFor = (maybeConstructor) =>
  isFn(maybeConstructor) ? maybeConstructor : MyObservable

const forEach = (collection, callback) => {
  for(let element of collection)
    callback(element)
}

const validateFn = (errMsg, fn) =>
  isFn(fn) ? fn : typeErr(errMsg)

function delegate(obj, fnName, desc = fnName) {
  let fn
  return (arg, ifDneRunThis) =>
    (fn || (fn = validateFn(
             `${inspect(obj)}.${fnName} should be the ${desc} function, instead its ${inspect(fn)}`,
             obj[fnName] || ifDneRunThis || noopFn
           ))
    ).call(obj, arg)
}

// After looking at their class, they implemented this as 2 different objects *sigh*
class Subscription {
  constructor(emitterCb, startCb, nextCb, errorCb, completeCb) {
    this.constructor  = Object // wtf even is this?
    this[pNextCb]     = nextCb
    this[pErrorCb]    = errorCb
    this[pCompleteCb] = completeCb
    this.next         = this.next.bind(this)
    this.error        = this.error.bind(this) // tests don't fail when I leave this commented out
    this.complete     = this.complete.bind(this)
    this.unsubscribe  = this.unsubscribe.bind(this)

    startCb(this)

    let cb
    try {
      this.closed || (cb = emitterCb(this))
    } catch(e) {
      errorCb(e, throwFn)
    }

    this[pCleanupCb] =
      isFn(cb)    && cb     ||
      isBlank(cb) && noopFn ||
      cb.unsubscribe        ||
      typeErr(`Invalid cleanup function: ${inspect(cb)}`)

    this.closed && this.unsubscribe({ force: true })
  }

  get closed() {
    return !!this[pIsClosed]
  }

  [pCleanupCb]() { } // noop, override this when you get the real callback

  unsubscribe(opts={}) {
    if(opts.force || !this.closed) try {
      this[pIsClosed] = true
      this[pCleanupCb]()
    } catch(e) { } // why do we hide errors?
  }

  next(val) {
    if(this.closed) return
    try { return this[pNextCb](val) }
    catch(e) {
      this.unsubscribe()
      throw e
    }
  }

  error(e) {
    if(this.closed) throw e
    this.unsubscribe()
    return this[pErrorCb](e, throwFn)
  }

  complete(val) {
    if(this.closed) return val
    this.unsubscribe()
    return this[pCompleteCb](val)
  }
}

Symbol.observable = Symbol.for("observable")

class MyObservable {
  constructor(emitter) {
    if(!isFn(emitter))
      throw new TypeError("First arg must be callable")
    this[pEmitterCb] = emitter
  }

  subscribe(observer) {
    let startCb, nextCb, errorCb, completeCb
    if(isFn(observer)) {
      startCb    = noopFn
      nextCb     = delegate(arguments, 0, 'next')
      errorCb    = delegate(arguments, 1, 'error')
      completeCb = delegate(arguments, 2, 'complete')
    } else if(isObj(observer)) {
      startCb    = delegate(observer, 'start')
      nextCb     = delegate(observer, 'next')
      errorCb    = delegate(observer, 'error')
      completeCb = delegate(observer, 'complete')
    } else {
      typeErr("Observer arg must be an object or the onNext function")
    }

    return new Subscription(this[pEmitterCb], startCb, nextCb, errorCb, completeCb)
  }

  [Symbol.observable]() {
    return this
  }

  static of(...items) {
    const Observable = constructorFor(this)
    return new Observable(({ next, complete }) => {
      forEach(items, next)
      complete()
    })
  }

  static from(toConvert) {
    const Observable = constructorFor(this)

    if(Symbol.observable in toConvert) {
      const observable = toConvert[Symbol.observable]()
      if('subscribe' in observable)
        return new Observable(observable.subscribe)
      return observable
    }

    return new Observable(({ next, complete }) => {
      forEach(toConvert, next)
      complete()
    })
  }

}

require("es-observable-tests")
  .runTests(MyObservable)
  .then(({logger: { passed, failed, errored }}) => {
    let status = green(passed)
    if(failed)  status += red(` ${failed}`)
    if(errored) status += yellow(` ${errored}`)
    console.log(status)
    if(failed || errored)
      process.exit(1)
  })
