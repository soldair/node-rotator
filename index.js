var EventEmitter = require('events').EventEmitter
,fs = require('fs')
,path = require('path')
;


module.exports = function(config){

  config = config||{};
  // how often log files should be rotated
  config.interval = config.interval||1000*60*60*24;
  // how often to check for rotation
  config.pollInterval = config.pollInterval||60000;

  var em = new EventEmitter()
  ,paused = false
  ,interval
  ;

  em.logs = {};
  em.addLog = function(p,data,cb){
    if(data.call) {
      cb = data;
      data = {};
    }
    
    fs.stat(p,function(err,stat){
      if(err) return cb(err);
      em.getRotateName(p,function(err,name){
        if(err) return cb(err);

        em.logs[path] = {
          stat:stat,
          data:data,
          rotateName:name
        };

        cb(null,em.logs[path]);

      });
    });
  };

  em.pause = function(){
    paused = true;
  };

  em.resume = function(){
    paused = false;
  };

  em.stop = function(){
    em.stopped = true;
    clearInterval(interval);
  };

  em.rotate = function(){
    if(paused) return;
    Object.keys(em.logs).forEach(function(p){
      var data = em.logs[p];
      
      if(data && data.rotating) return;
      
      //
      //compare time!
      //
      var ctime = data.stat.ctime
      ,age = Date.now()-ctime.valueOf()
      ;

      if(age < config.interval) return;

      em.logs[p].rotating = true;
      var rs = fs.createReadStream(p);

      rs.pause();
      rs.on('end',function(){
        fs.unlink(p,function(){
          // create the file.
          fs.open(p,'w',parseInt('0655',8),function(err,fd){
            if(err) return em.emit('rotate-error',err,p);
            
            delete em.logs[p];

            em.addLog(p,data.data,function(err,data){
              if(err) return em.emit('rotate-error',err,p);

              em.emit('rotated',p,data);             
            });
          });
        });
      });

      rs.on('error',function(err){
        em.emit('rotate-error',err,p);
      });

      fs.stat(p,function(err,stat){
        // update stat for correct size value
        if(!err) data.stat = stat;
        rs.resume();
      });

      em.emit('rotate',rs,path,data);

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
      cb(null, path.join(dir,em.formatTime(new Date())+(id?'-'+id:'')+'_'+name));
    }); 
  };

  em.getRotateId = function(p,cb){
    fs.readdir(path.dirname(p),function(err,data){
      if(err) return cb(err,0);

      var id = 0;
      data.forEach(function(f){
        if(f.indexOf(p) !== -1){
          match = true;
          last = (f.match(/([\d]+)$/)||[]).shift();
          if(last && +last > id) {
            id = last;
          }
        }
      });
      
      cb(null,last);
    });
  };

  em.on('rotate',function(rs,p,data){
    // 
    // default rotater-tot
    //
    rs.pipe(fs.createWriteStream(data.rotateName));
  });

  interval = setInterval(function(){
    em.rotate();
  },config.pollInterval);

  return em;
};


