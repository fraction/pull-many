

/*
all pull streams have these states:

{
  START: {
    read: READING,
    abort: ABORTING
  },
  READY: {
    read: READING,
    abort: ABORTING
  },
  READING: {
    cb: READY,
    err: ERROR,
    end: END
  },
  ABORTING: {
    cb: END
  },
  ERROR: {},
  END: {}
}

this module takes a collection of pull-streams,
and interleaves their states.
if all the streams have ended, it ends.
If it is in reading state, and one stream goes has READING->cb
it goes into READY

on read, trigger read on every stream in START or READY

on abort, trigger abort on every stream in START or READY

if a stream is in READY, and big stream is in ABORT,
trigger abort

if every stream is in END or ERROR, trigger end or error

could you describe this declaritively or something?
*/

module.exports = function (ary) {

  var open = !ary
  var inputs = (ary || []).map(create), i = 0, abort, cb

  function create (stream) {
    return {ready: false, reading: false, ended: false, read: stream, data: null}
  }

  function check () {
    if(!cb) return
    clean()
    var l = inputs.length
    var _cb = cb
    if(l === 0 && !open) {
      cb = null
      _cb(abort ||  true)
    }

    //scan the inputs to check whether there is one we can use.
    for(var j = 0; j < l; j++) {
      var current = inputs[(i + j) % l]
      if(current.ready && !current.ended) {
        current.ready = false
        i ++
        cb = null
        return _cb(null, current.data)
      }
    }
  }

  function clean () {
    var l = inputs.length
    //iterate backwards so that we can remove items.
    while(l--) {
      if(inputs[l].ended)
        inputs.splice(l, 1)
    }
  }

  function next () {
    var l = inputs.length
    while(l--)
      (function (current) {
        //read the next item if we aren't already
        if(current.reading || current.ended || current.ready) return
        current.reading = true
        var sync = true
        current.read(abort, function next (end, data) {
          if(end === true || abort) current.ended = true
          else if(end) abort = current.ended = end
          current.data = data
          current.ready = true
          current.reading = false
          //check whether we need to abort this stream.
          if(abort && !end) current.read(abort, next)
          if(!sync) check()
        })
        sync = false
      })(inputs[l])

    //scan the feed
    check()
  }

  function read (_abort, _cb) {
    abort = _abort
    cb = _cb
    next()
  }

  read.add = function (stream) {
    if(!stream) {
      //the stream will now end when all the streams end.
      open = false
      //we just changed state, so we may need to cb
      return next()
    }
    inputs.push(create(stream))
  }

  read.cap = function () {
    read.add(null)
  }

  return read
}
