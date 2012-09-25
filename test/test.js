var test = require('tap').test
,rotater = require(__dirname+'/../index.js')
,fs = require('fs')
;

test('can make rotater',function(t){
  var tot = rotater({pollInterval:1,interval:10});

  t.ok(tot,'should have returned an emitter');

  var ws = fs.createWriteStream('test.log')
  , str = ""
  , i = 0
  , interval = setInterval(function(){
    var s = "hi "+(++i)+"\n";
    ws.write(s);
    str += s;
  },3)
  ;

  var logs = [];

  tot.addFile('test.log',function(err,data){
    t.ok(!err,'should not have error adding file');
    t.ok(data.rotateName,'rotate name should be set');
  });

  var rotates = 0;
  tot.on('rotate',function(rs,p,data){
    rotates++;

    logs.push(data.rotateName+'.gz');

    tot.rotateAfterClose(p,ws);
    var old = ws;
    ws = fs.createWriteStream(p);
  });

  tot.on('rotate-error',function(err){
    t.fail('should not get rotate error');
    tot.stop();
    t.end();
  });

  tot.on('rotated',function(file,data){
    t.ok(rotates,'rotate event happened');
    if(rotates == 2) {
      logs.push('test.log');

      tot.stop();
      clearInterval(interval);
      ws.end();

      var data = []
      , job = function(){
        var name = logs.shift();
        var rs = fs.createReadStream(name);
        if(~name.indexOf('.gz')){
          var gunzip = require('zlib').createGunzip()
          rs.pipe(gunzip)
          gunzip.on('data',function(buf){
            data.push(buf);
          });
        } else {
          rs.on('data',function(buf){
            data.push(buf);
          });
        }

        rs.on('end',function(){
          done() ;
          fs.unlinkSync(name); 
        })
      },done = function(){
        if(logs.length) return job();
        var realOutput = '';
        if(Buffer.concat) {
          realOutput = Buffer.concat(data).toString();
        } else {
          data.forEach(function(b){
            realOutput += b.toString();
          });
        }

        t.equals(realOutput,str,'combined rotated files should have exactly the data i wrote. no more no less');
        t.end();

      }
      ;

      //get all created log files
      //
      done();
    }
  });
});

