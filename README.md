
[![Build Status](https://secure.travis-ci.org/soldair/node-rotater.png)](http://travis-ci.org/soldair/node-rotater)

node-rotater
============

Emit rotate events for log files based on interval. Rotate event handlers are called "rotater-tots" or just tots. Tots get passed a (readable stream, the log file path, and the data passed in when the log was asociated).


## example

```js
var rotater = require('rotater');
var tot = rotater();

tot.addLog('./some.log',function(err){
  if(err) throw err; // oh no could not find the log or somthing
  console.log('log scheduled for rotation!');
});

tot.on('rotated',function(rs,path,data){
  console.log(path,'was old and needed to be rotated. copied to ',data.toRotate);
  // prints "./some.log was old and needed to be rotated. copied to ./20120914_some.log"
});

```


 
