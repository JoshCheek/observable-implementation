const util = require('util')

// private property names
const pEmitterCb  = Symbol('emitterCb')
const pNextCb     = Symbol('nextCb')
const pErrorCb    = Symbol('errorCb')
const pCompleteCb = Symbol('completeCb')
const pCleanupCb  = Symbol('cleanupCb')
const pIsClosed   = Symbol('closed?')

const noopFn  = (val) => {}
const throwFn = (e)   => { throw e }
const inspect = (val) => util.inspect(val, { colors: true })
const noThrow = (cb)  => { try { cb() } catch(e) { } } // why do we hide errors from the user?!

const log = (...args) =>
  args.forEach(arg =>
    console.log(
      ('string' === typeof arg)
      ? `\x1b[35m${arg}\x1b[0m` // print strings in magenta
      : inspect(arg)            // print non-strings as inspected/highlighted objects
    )
  )

Symbol.observable = Symbol.for("observable")

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
    if(!this.closed)
      try { cb = emitterCb(this) }
      catch(e) { errorCb(e, throwFn) }

    this[pCleanupCb] =
      'function' === typeof cb && cb ||
      null       === cb && noopFn    ||
      undefined  === cb && noopFn    ||
      cb.unsubscribe                 ||
      throwFn(new TypeError(`Invalid cleanup function: ${inspect(cb)}`))

    this.closed && this.unsubscribe({ force: true })
  }

  get closed() {
    return !!this[pIsClosed]
  }

  [pCleanupCb]() { } // noop, override this when you get the real callback

  unsubscribe(opts={}) {
    if(opts.force || !this.closed) {
      this[pIsClosed] = true
      noThrow(this[pCleanupCb])
    }
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
    this[pEmitterCb] = emitter
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

    return new Subscription(this[pEmitterCb], startCb, nextCb, errorCb, completeCb)
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

require("es-observable-tests")
  .runTests(MyObservable)
  .then(({logger: { passed, failed, errored }}) => {
    let status = `\x1b[32m${passed}`
    if(failed)  status += ` \x1b[31m${failed}`
    if(errored) status += ` \x1b[33m${errored}`
    console.log(status)
    if(failed || errored)
      process.exit(1)
  })
