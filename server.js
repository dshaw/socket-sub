var fs = require("fs"),
<<<<<<< HEAD
    http = require("http"),
    sys = require("sys"),
=======
    express = require("express"),
    sys = require("sys"),
    http = require("http"),
>>>>>>> julien51/master
    querystring = require("querystring"),
    url = require("url"),
    base64 = require("./deps/base64"),
    ws = require('./deps/node-websocket-server/lib/ws');

<<<<<<< HEAD
var config = JSON.parse( fs.readFileSync("./config.json", "utf8") ) || {};

// To configure this application, edit "config.json".
var HOST = config.host || null, // localhost
    PORT = config.port || 27261,
    HUB = config.hub || "http://superfeedr.com/hubbub",
    USERNAME = config.username || "username",
    PASSWORD = config.password || "password",
    CLIENT = config.client || "client.html",
    DEBUG = config.password || false;

var percentEncode = function( str ) {
  return encodeURI( str )
      .replace(/\!/g, "%21")
      .replace(/\'/g, "%27")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
      .replace(/\*/g, "%2A")
      .replace(/\./g, "%2E");
};

var printRequest = function(request, body) {
  sys.puts("");
  sys.puts("REQUEST");
  sys.print(request._header);
  sys.puts(body);
};

var printResponse = function(response, body) {
  sys.puts("");
  sys.puts("RESPONSE");
  sys.puts("STATUS: "+response.statusCode);
  sys.puts("HEADERS: "+JSON.stringify(response.headers));
  sys.puts("BODY: "+body);
};

var Subscription = function( callbackUri, feed ) {
  this.mode = "subscribe";
  this.verify = "async";
  this.callback = callbackUri;
  this.topic = this.id = feed; // TODO: convert id into a hash of the feed url.

  var params = {
    "hub.mode" : this.mode,
    "hub.verify" : this.verify,
    "hub.callback" : this.callback,
    "hub.topic" : this.topic.replace(/"/g, "")
  };

  this.data = function() {
    return percentEncode( querystring.stringify( params ) );
  }
};

var SubscriptionManager = function() {
  this.subscribers = {};

  this.connect = function(id) {
    if (!this.subscribers[id]) {
      this.subscribers[id] = {
        subscriptions : {}
      };
    }
  }

  this.disconnect = function(id) {
    delete this.subscribers[id];
  }

  this.subscribe = function(id, subscription) {
    if (!this.subscribers[id].subscriptions[subscription.id]) {
      this.subscribers[id].subscriptions[subscription.id] = subscription;
    }
  }
};

var requestHandler = function( req, res ) {

  var handle,
      id,
      uri = url.parse( req.url ),
      path = (uri.pathname.substring(1)).split("/"),
      simpleHeader = function(body) {
        return {
          "Content-Type": 'text/html',
          "Content-Length": body.length
        }
      }
      requestMap = {
        404 : function ( req, res ) {
          body = "File not found"
          headers = simpleHeader(body);
          res.sendHeader(404, headers);
          res.write(body);
          res.close();
        },
        index : function( req, res ) {
          var body,
              headers,

              loadResponseData = function( callback ) {
                if (body && headers) {
                  callback();
                  return;
                }
                fs.readFile( CLIENT, function (err, data) {
                  if (err) {
                    sys.puts("Error loading " + filename);
                  } else {
                    body = data;
                    headers = simpleHeader(body);
                    callback();
                  }
                });
              };

          loadResponseData(function () {
            res.writeHead(200, headers);
            res.end(body);
          });
        },
        wsclient : function ( req, res, id ) {
          switch(req.method) {
            case "GET":
              body = id,
              headers = simpleHeader(body);
              res.sendHeader(200, headers);
              res.write(body);
              res.close();
              break;
            case "POST":
              var data = "", hub = this;
              req.addListener("data", function(chunk) {
                  data += chunk;
              });
              req.addListener("end", function() {
                  var params = qs.parse(data);
                  if("hub.mode" in params &&
                     ~["publish",
                       "subscribe",
                       "unsubscribe"].indexOf(params["hub.mode"])) {
                      hub["do_"+params["hub.mode"]](req, res, params);
                  } else {
                      hub["400"](req, res, "Unknown hub.mode parameter");
                  }
              });
              break;
          }
        }
      };

  if (path.length === 0 || path === "client.html") {
    handle = "index";
  } else if ( path[0] === "wsclients" ) {
    if ( !!path[1] && !isNaN(parseInt(path[1], 10)) ) {
      handle = "wsclients";
      id = path[1];
    } else {
      handle = "404";
    }
  } else if ( !(path in requestMap) && !isNaN(parseInt(path, 10)) ) {
    handle = "404";
  } else {
    req.setBodyEncoding("utf-8");
    requestMap[handle]( req, res, id );
  }
};


var subMan = new SubscriptionManager(); // connection manager

=======
>>>>>>> julien51/master

var config = JSON.parse(fs.readFileSync("./config.json", "utf8") ) || JSON.parse(fs.readFileSync("./default_config.json", "utf8") );

<<<<<<< HEAD
server.addListener("listening", function() {
  var hostInfo = (HOST || "localhost") + ":" + PORT.toString();
  sys.puts("Server at http://" + hostInfo + "/");
  sys.puts("Listening for connections at ws://" + hostInfo);
});
=======
var log = function(message) {
  if(config.debug) {
    sys.puts(message);
  }
};

//////////////////////////////////////////////////////////////////////////////////////////
//                              Object Definitions                                      //
//////////////////////////////////////////////////////////////////////////////////////////

//
// Feed object
var Feed = function(url) {
  this.url = url;
  this.id = base64.encode(url);
}

//
// Subscription object
var Subscription = function(socket_id, feed ) {
  this.socket_id = socket_id;
  this.feed = feed; 
  this.callback_url = config.pubsubhubbub.callback_url_root + config.pubsubhubbub.callback_url_path + this.socket_id + "/" + this.feed.id;
};

//
// Subscription store. We may want to persist it later, but right now, it's in memory.
// Which means that the server will probably eat a lot of memory when there are a lot of client connected and/or a lot of feeds susbcribed
var SubscriptionStore = function() {
  this.subscribers = {};
  
  //
  // Delete the subscription for this socket id and feed id. If all susbcriptions have been deleted for this socket id, delete the it too.
  this.delete_subscription = function(socket_id, feed_id) {
    var subscriber = this.subscribers[socket_id];
    if(subscriber) {
      delete this.subscribers[socket_id].subscriptions[feed_id];
      if(this.subscribers[socket_id].subscriptions == {}) {
        delete this.subscribers[socket_id];
      }
      return true
    }
    else {
      return false;
    }
  }

  //
  // Returns all the susbcriptions for a given socket id
  this.for_socket_id = function(socket_id) {
    if(this.subscribers[socket_id]) {
      return this.subscribers[socket_id].subscriptions;
    }
    else {
      return {};
    }
  }

  // 
  // Creates (or just returns) a new subscription for this socket id and this feed url
  this.subscribe = function(socket_id, url) {
    if (!this.subscribers[socket_id]) {
      this.subscribers[socket_id] = {
        subscriptions : {}
      };
    }
    var feed = new Feed(url)
    if (!this.subscribers[socket_id].subscriptions[feed.id]) {
      var subscription = new Subscription(socket_id, feed);
      this.subscribers[socket_id].subscriptions[feed.id] = subscription;
      return subscription;
    }
    else {
      return this.subscribers[socket_id].subscriptions[feed.id];
    }
  }
  
  //
  // Returns the subscription for this socket id and feed id
  this.subscription = function(socket_id, feed_id) {
    var subscriber = this.subscribers[socket_id];
    if(subscriber) {
      return this.subscribers[socket_id].subscriptions[feed_id];
    }
    else {
      return false;
    }
  }
  
};
>>>>>>> julien51/master


<<<<<<< HEAD
  subMan.connect( conn._id );
  sys.puts( "<"+conn._id+"> connected" );
  server.send( conn._id, "Awaiting feed subscription request" );

  conn.addListener("message", function( message ) {
    var wsid = conn._id;
    sys.puts( "<"+wsid+"> "+message );
    // TODO: validate feed uri
    sys.puts( "<"+wsid+"> Subscribing to "+message );
    server.send( wsid, "Subscribing to "+message );

    // Send subscription request to hub.
    var callbackUri = "http://"+(HOST || "localhost")+":"+PORT+"/wsclients/"+wsid+"/",
        sub = new Subscription( callbackUri, message ),
        body = sub.data(),
        hub = url.parse( HUB ),
        contentLength = body.length,
        headers = {
          "Accept": '*/*',
          "Authorization": "Basic "+base64.encode(USERNAME + ":" + PASSWORD),
          "Content-Length": contentLength,
          "Content-Type": "application/x-www-form-urlencoded",
          "Host": hub.hostname,
          "User-Agent": "Socket-Sub for Node.js"
        };

    if ( (url.parse( callbackUri )).hostname === "localhost" ) {
      var warning = "WARNING: PubSubHubbub subscriber cannot run from localhost.";
      sys.puts(warning);
      server.send( wsid, warning );
    }

    var client = http.createClient( hub.port || 80, hub.hostname );
    var request = client.request("POST", hub.pathname + (hub.search || ""), headers);

    request.write(body, 'utf8');

    //    for (var p in request) {
    //      if (typeof request[p] !== "function") {
    //        sys.puts( p+": "+request[p] );
    //      }
    //    }
    if (DEBUG) printRequest( request, body );

    request.addListener("response", function(response) {
      var body = "";

      response.addListener("data", function(chunk) {
        body += chunk;
      });

      response.addListener('end', function() {
        subMan.subscribe(conn._id, sub);
        if (DEBUG) printResponse( response, body );
      });
    });

    request.end();
=======
//////////////////////////////////////////////////////////////////////////////////////////
//                              PubSubHubbub                                            //
//////////////////////////////////////////////////////////////////////////////////////////


//
// Main PubSubHubub method. Peforms the subscription and unsubscriptions
// It uses the credentials defined earlier.
var subscribe = function(subscription, mode, callback, errback) {
  var params = {
    "hub.mode"      : mode,
    "hub.verify"    : config.pubsubhubbub.verify_mode,
    "hub.callback"  : subscription.callback_url,
    "hub.topic"     : subscription.feed.url
  };
  
  var body = querystring.stringify(params)
      hub = url.parse(config.pubsubhubbub.hub),
      contentLength = body.length,
      headers = {
        "Accept": '*/*',
        "Authorization": "Basic "+ base64.encode(config.pubsubhubbub.username + ":" + config.pubsubhubbub.password),
        "Content-Length": contentLength,
        "Content-Type": "application/x-www-form-urlencoded",
        "Host": hub.hostname,
        "User-Agent": "Socket-Sub for Node.js",
        "Connection": "close"
      };

  var client  = http.createClient(hub.port || 80, hub.hostname );
  var request = client.request("POST", hub.pathname + (hub.search || ""), headers);

  request.write(body, 'utf8');

  request.addListener("response", function(response) {
    var body = "";
    response.addListener("data", function(chunk) {
        body += chunk;
    });
    response.addListener('end', function() {
      if(response.statusCode == 204) {
        callback();
      }
      else {
        errback(body);
      }
    });
>>>>>>> julien51/master
  });
  request.end(); // Actually Perform the request
}


//////////////////////////////////////////////////////////////////////////////////////////
//                              Let's get started                                       //
//////////////////////////////////////////////////////////////////////////////////////////

// Web Socket Server ---- (server <-> browser) --------------------------------------
var ws_server = ws.createServer({ debug: config.debug });

ws_server.addListener("listening", function() {
  var hostInfo = config.websocket.listen.host + ":" + config.websocket.listen.port.toString();
  log("Listening to WebSocket connections on ws://" + hostInfo);
});

<<<<<<< HEAD
server.addListener("close", function( conn ) {
  subMan.disconnect( conn._id );
  sys.puts( "<"+conn._id+"> closed connection." );
});

// Handle HTTP Requests
server.addListener("request", requestHandler);
=======
// Handle Web Sockets when they connect
ws_server.addListener("connection", function(socket ) {
  // When connected
  ws_server.send(socket.id, "Awaiting feed subscription request");
  socket.addListener("message", function(feed_url) {
    // When asked to subscribe to a feed_url
    ws_server.send(socket.id, "Subscribing to " + feed_url);
    var subscription = subscriptions_store.subscribe(socket.id, feed_url);
    subscribe(subscription, "subscribe", function() {
      log("Subscribed to " + feed_url + " for " + socket.id);
      ws_server.send(socket.id, "Subscribed to " + feed_url);
    }, function(error) {
      log("Failed subscription to " + feed_url + " for " + socket.id);
      ws_server.send(socket.id, "Couldn't subscribe to " + feed_url + " : "+ error.trim() );
    });
  });
});

// Handle Web Sockets when they disconnect. We need to unsusbcribe.
ws_server.addListener("close", function(socket ) {
  var existing_subs = subscriptions_store.for_socket_id(socket.id);
  for(feed_id in existing_subs)
  {
    subscribe(existing_subs[feed_id], "unsubscribe", function() {
      log("Unsubscribed from "+ existing_subs[feed_id].feed.url );
      subscriptions_store.delete_subscription(socket.id, feed_id);
    }, function() {
      log("Couldn't unsubscribe from "+ existing_subs[feed_id].feed.url );
    });
  }
});

// Web Server -------- (server <-> hub) --------------------------------------------
var web_server = express.createServer();

// PubSubHubbub verification of intent
web_server.get(config.pubsubhubbub.callback_url_path + ':socket_id/:subscription_id', function(req, res) {
    var subscription = subscriptions_store.subscription(req.params.socket_id, req.params.subscription_id);
    if (subscription) {
      // Let's find teh socket to confirm subscription or not!
      ws_server.send(subscription.socket_id, "", function(client) {
        if(client) {
          // Connected
          if(req.query && req.query.hub && req.query.hub.mode == "subscribe") {
            log("Confirmed subscription to" + req.params.subscription_id + " for " + req.params.socket_id)
            res.send(req.query.hub.challenge, 200);
          }
          else {
            log("Couldn't confirm subscription to " + req.params.subscription_id + " for " + req.params.socket_id)
            res.send(404);
          }
        }
        else {
          // Not connected
          if(req.query && req.query.hub && req.query.hub.mode == "unsubscribe") {
            log("Confirmed subscription to" + req.params.subscription_id + " for " + req.params.socket_id)
            res.send(req.query.hub.challenge, 200);
          }
          else {
            log("Couldn't confirm subscription to " + req.params.subscription_id + " for " + req.params.socket_id)
            res.send(404);
          }
        }
      });
    }
    else {
      log("Couldn't confirm subscription to " + req.params.subscription_id + " for " + req.params.socket_id)
      res.send(404);
    }
});

//
// Incoming POST notifications.
// Sends the data to the right Socket, based on the subscription. Unsubscibes unused subscriptions.
web_server.post(config.pubsubhubbub.callback_url_path + ':socket_id/:feed_id', function(req, res) {
    var subscription = subscriptions_store.subscription(req.params.socket_id, req.params.feed_id);
    if(subscription) {
      req.on('data', function(data) {
        ws_server.send(subscription.socket_id, data, function(socket) {
         if(socket) {
           log("Sent notification for " + subscription.socket_id + " from " + subscription.feed.url)
         } 
         else {
           log("Looks like " + subscription.socket_id + " is offline!");
           subscribe(subscription, "unsubscribe", function() {
             log("Unsubscribed from "+ subscription.feed.url );
             subscriptions_store.delete_subscription(subscription.socket_id, req.params.feed_id);
           }, function() {
             log("Couldn't unsubscribe from "+ subscription.feed.url );
           }); 
         }
        });
      })
      res.send("Thanks!", 200);
    }
    else {
      log("Couldn't find the subscription from " + req.params.feed_id + " for " + req.params.socket_id)
      res.send(404);
    }
});

web_server.addListener("listening", function() {
  var hostInfo = config.pubsubhubbub.listen.host + ":" + config.pubsubhubbub.listen.port.toString();
  log("Listening to HTTP connections on http://" + hostInfo);
});
>>>>>>> julien51/master

web_server.get("/", function(req, res) {
  res.send("<a href='http://github.com/julien51/socket-sub'>Socket Sub</a>", 200);
});

var subscriptions_store = new SubscriptionStore(); 
ws_server.listen(config.websocket.listen.port, config.websocket.listen.host);
web_server.listen(config.pubsubhubbub.listen.port, config.pubsubhubbub.listen.host);

