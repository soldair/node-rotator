
[![Build Status](https://secure.travis-ci.org/soldair/node-rotator.png)](http://travis-ci.org/soldair/node-rotator)

# rotator

Emit rotate events for log files based on interval. Rotate event handlers are called "rotator-tots" or just tots. Tots get passed a (readable stream, the log file path, and the data passed in when the log was asociated).


## example

```js
var rotator = require('rotator');
var tot = rotator();

tot.addFile('./some.log',function(err){
  if(err) throw err; // oh no could not find the log or somthing
  console.log('log scheduled for rotation!');
});

tot.on('rotate',function(rs,file,data){
  // stop writing to the log
  // also upload it to s3? content-length is fs.stat.size 
  // rs.pipe ....
});

tot.on('rotated',function(rs,path,data){
  console.log(rs,'was old and needed to be rotated. copied to ',path);
  // prints "./some.log was old and needed to be rotated. copied to ./20120914_some.log"
});

```

## api

rotator(config Object)
  - config
    - interval
      - the rotate interval for all files on this tot defaults to 1 day
    - size
      - the max size of the file before  it is rotated. defauls to 5gb
    - gzip = true
      - rotated files are by default gzipped
    - pollInterval
      - how often to check if any logs need to be rotated. defaults to 1 minute.
    - statInterval
      - how often to poll size. i did not want to install watchers because we should not really need to check this so often.
    
  - returns an EventEmitter

tot EventEmitter
  - addFile(path)
    - add a file to be rotated
  - removeFile(path)
    - remove a path from the rotate list
  - formatTime(date)
    - creates day timestamp from UTC YMD overload this function to change the format.
  - rotate(path,cb)
    - path the file path you want to rotate
    - cb callback
  - rotateAfterClose(path,stream)
    - the file path that must not be rotated until stream close
    - the stream that must close

Events 
  - rotate(rs ReadabeStream,p file path, data)
  - rotated(p file path,data)
  - rotate-done
    - all active rotates are done
  - rotate-error(err Error, p file path, data)
  - rotate-empty(p path,data);

Data Object
data objects are passed to events. this is the data associated with each file.
  - data.stat
  - data.toRotate
  - data.rotating

## victory

let me know if you have victory
