var EventEmitter = require('events').EventEmitter
,fs = require('fs')
,path = require('path')
,zlib = require('zlib')
;


module.exports = function(config){

  config = config||{};
  // how often log files should be rotated
  config.interval = config.interval||1000*60*60*24;

  // how big log files can be before they get rotated.
  config.size = config.size||1024*1024*1024*5;// 5 gb

  // how often to check for rotation
  config.pollInterval = config.pollInterval||60000;

  // how often to update size.
  config.statInterval = config.statInterval||65000;

  // default to gzipping output files.
  if(typeof config.gzip == 'undefined') config.gzip = true;

  var em = new EventEmitter()
  ,paused = false
  ,interval
  ;

  em.logs = {};
  var addQueue = {};
  em.addFile = function(p,data,cb){
    if(data && data.call) {
      cb = data;
      data = {};
    }

    if(!addQueue[p]) addQueue[p] = [];
    addQueue[p].push(cb||function(){});
    if(addQueue[p].length > 1) return;
    
    fs.stat(p,function(err,stat){

      if(err) return cb(err);
      if(em.logs[p]){
        em.logs[p].stat = stat;
        return cb(null,em.logs[p]);
      }
      em.getRotateName(p,function(err,name){
        if(!err) {
          em.logs[p] = {
            stat:stat,
            data:data,
            rotateName:name
          };
        }

        var q = addQueue[p];
        delete addQueue[p];
        while(q.length) q.shift()(err,em.logs[p]);

      });
    });
  };

  em.removeFile = function(p){
    if(em.logs[p]) {
      delete em.logs[p];
    }
  };

  em.pause = function(){
    paused = true;
  };

  em.resume = function(){
    paused = false;
  };


  em.intervals = [];
  em.clearIntervals = function(){
    while(em.intervals.length) {
      clearInterval(em.intervals.shift());
    }
  };

  em.stop = function(cb){

    em.clearIntervals();
    em.stopped = true;

    if(em.rotating) {
      em.once('rotate-done',function(){
        if(cb) {
          cb(); 
          cb = false;
        }  
      });
    } else {
      if(cb) process.nextTick(cb);
    }
  };

  em.rotating = false;
  var rotateId = 0;
  em.rotate = function(cb){
    var z = this;
    if(paused || em.stopped) {

      process.nextTick(function(){
        cb(false,[]);// different return on paused?
      });
      return;
    }

    if(!z.rotating) z.rotating = [];

    z.rotating.push(cb);
    if(z.rotating.length > 1) return;

    rotateId++;

    var rotated = []
    , errors = []
    , jobs = 0
    , job = function(i,name){
      jobs += i;

      process.nextTick(function(){
        if(!jobs) {
          var cbs = z.rotating;
          z.rotating = false;
          z.emit('rotate-done');

          if(cbs){
            while(cbs.length){
              cb = cbs.shift();
              if(cb) cb(error.length?errors:null,rotated);
            }
          }
        }
      });
    };

    Object.keys(this.logs).forEach(function(p){
      var data = em.logs[p];

      if(data && data.rotating) {
        return;
      }

      //
      //compare time!
      //
      var ctime = data.stat.ctime
      , size = data.stat.size
      , age = Date.now()-ctime.valueOf()
      ;

      if(age < config.interval && size < config.size) {
        return;
      }

      em.logs[p].rotating = true;
      //
      // 
      //
      job(1,'stat');

      fs.stat(p,function(err,stat){

        if((err && err.code == 'ENOENT') || !stat.size) {
          //not really an error
          em.logs[p].rotating = false;
          return job(-1,'stat error');
        }

        data.stat = stat;

        z._copyAndRecreate(p,function(err,tmp){
          if(err){
            em.emit('rotate-error',err,p,data.rotateName);
            //
            // error setting this up. job is done.
            //
            return job(-1,'copy error');
          }

          var rs = fs.createReadStream(tmp);

          rs.pause();

          rs.on('close',function(){

            delete em.logs[p];
            em.addFile(p,data.data,function(){
              fs.unlink(tmp,function(err){
                //
                // victory. file has been rotated.
                //
                job(-1,'rotate read stream close');
                em.emit('rotated',p,data.rotateName);
              });
            });
          }); 

          rs.on('error',function(err){
            //
            // damn. error rotaing file!
            //
            job(-1,'rotate read stream error');
            em.emit('rotate-error',err,p,data.rotateName);
          });

          em.emit('rotate',rs,p,data);
          // 
          // defer rotate handler to allow rotate handler to bind streams in rotateAfterClose
          //
          process.nextTick(function(){
            if(em.pendingClose[p]) {
              em.pendingClose[p].done = function(){
                rs.resume();
              };
            } else {
              rs.resume();
            }
          });
        });
      });
    });

    // there was nothing to rotate?
    job(0,'kick it off');
  };

  em.pendingClose = {};

  em.rotateAfterClose = function(file,stream){
    var z = this;
    if(!z.pendingClose[file]) z.pendingClose[file] = {count:0,file:file,start:Date.now()};
    z.pendingClose[file]++;

    stream.on('close',function(){
      z.pendingClose[file].count--;
      if(!z.pendingClose[file].count){
        //
        if(z.pendingClose[file].done){
          var data = z.pendingClose[file];
          delete z.pendingClose[file];
          data.done();
        }
      }
    });
  };

  em.formatTime = function(date){
    var month = ""+(date.getUTCMonth()+1);
    if(month.length == 1) month = '0'+month;
    return date.getUTCFullYear()+''+month+''+date.getUTCDate(); 
  };

  em.getRotateName = function(p,cb){
    var dir = path.dirname(p)
    , name = path.basename(p)
    ;

    this.getRotateId(p,function(err,id) {
      if(err) return cb(err);
      var toRotate = path.join(dir,em.formatTime(new Date())+(id?'-'+id:'')+'_'+name);
      cb(null,toRotate);
    }); 
  };

  em.getRotateId = function(p,cb){

    var base = path.basename(p),match;
    fs.readdir(path.dirname(p),function(err,data){
      if(err) {
        return cb(err,0);
      }

      var id = 0;
      var timestring = em.formatTime(new Date());
      data.forEach(function(f){

        if(~f.indexOf(base) && ~f.indexOf(timestring)){

          match = true;
          f = f.replace(timestring,'');

          var last = +(f.substr(0,f.indexOf('_')).replace(/[^\d]+/g,''));
          if(last && last >= id) id = last;
        }
      });
      
      if(match) ++id;

      cb(null,id);
    });
  };

  em.on('rotate',function(rs,p,data){
    // 
    // default rotator/-tot
    //
    if(!data.stat.size) {
      // setting ctime to now so its not checked for one more whole interval
      data.stat.ctime = new Date();
      em.emit('rotate-empty',p,data);
      return;
    }

    var ws;
    var alreadyGz = (data.rotateName.indexOf('.gz') == data.rotateName.length-3);

    if(config.gzip && !alreadyGz) {
      ws = zlib.createGzip();
      data.rotateName += '.gz';
      ws.pipe(fs.createWriteStream(data.rotateName));
    } else {
      ws = fs.createWriteStream(data.rotateName);
    }

    rs.pipe(ws);
  });

  // make sure pending close calls cant stack up
  em.cleanUp = function(){
    var z = this;
    Object.keys(z.pendingClose).forEach(function(file){
      //
      var time = Date.now()-z.pendingClose[file].start;
      // 5 minute timeout waiting for close 
      if(time > 1000*60*5) {
        delete z.pendingClose[file];
        z.emit('rotate-error',new Error('pending close timed out after 5 minutes'),file);
      }
    });
  };


  em.updateStats = function(cb){
    var pending = 0;
    Object.keys(em.logs).forEach(function(file){
      em.updateStat(file,function(){
        pending--;
        if(!pending) cb(undefined,true);
      });
    });
  };

  em.updateStat = function(p,cb){
      if(!em.logs[p]) {
        return process.nextTick(function(){
          cb(new Error('tried to update stat of a file that is not being rotated'),p);
        });
      }
      
      fs.stat(p,function(err,stat){
        if((err && err.code == 'ENOENT') || !stat.size){
          em._touch(p,function(err){
            if(err) return cb(err);
            //
            // now that it exists, update the stat.
            //
            em.updateStat(p,cb);
          });
        } else {
          //
          // set the stat.
          //
          if(em.logs[p]) em.logs[p].stat = stat;
          cb(undefined,p);
        }
      }); 
  };

  em._touch = function(p,cb){
      fs.open(p,'a+',parseInt('0655',8),function(err,fd){
        if(!err) fs.close(fd);
        cb(err,true);
      });
  };

  em._copyAndRecreate = function(p,cb) {
    var tmp = p+'_'+Date.now()+''+Math.random();
    fs.rename(p,tmp,function(err) {
      if(err) return cb(err);
      // make a new file at path.
      em._touch(p,function(){
        cb(null,tmp);
      });
    });  
  };

  //
  // ttl rotation
  //
  em.intervals.push(setInterval(function(){
    try{
      em.rotate();
      em.cleanUp();
    } catch(e) {
      console.error('log rotator error ',e);
    }
  },config.pollInterval));

  //
  // stat size rotation.
  //
  em.intervals.push(setInterval(function(){
    em.updateStats();
  },config.statInterval));
  

  return em;
};


