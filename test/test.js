var test = require('tap').test
,rotater = require(__dirname+'/../index.js')
,fs = require('fs')
;

test('can make rotater',function(t){
    var tot = rotater({pollInterval:1,interval:10});
    t.ok(tot,'should have returned an emitter');

    var ws = fs.createWriteStream('test.log');
    ws.write('hihihihihihihihihihihih');
    ws.end();

    tot.addFile('test.log',function(err,data){
      t.ok(!err,'should not have error adding file');
      t.ok(data.rotateName,'rotate name should be set');
    });

    tot.on('rotate',function(){
      console.log('rotate event!');
    });

    tot.on('rotate-error',function(err){
      console.log('rotate error =(');
      console.log(err.message,err.stack,err);
      t.fail('should not get rotate error');
      tot.stop();
      t.end();
    });

    tot.on('rotated',function(){
      console.log('rotated the log');
      tot.stop();
      t.end();
    })
});

