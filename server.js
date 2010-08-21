var fs = require("fs"),
    express = require("express"),
    sys = require("sys"),
    http = require("http"),
    querystring = require("querystring"),
    url = require("url"),
    base64 = require("./deps/base64"),
    ws = require('./deps/node-websocket-server/lib/ws');


var config = JSON.parse( fs.readFileSync("./config.json", "utf8") ) || JSON.parse( fs.readFileSync("./default_config.json", "utf8") );


//////////////////////////////////////////////////////////////////////////////////////////
//                              Helpers                                                 //
//////////////////////////////////////////////////////////////////////////////////////////


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
var Subscription = function( wsid, feed ) {
  this.wsid = wsid;
  this.feed = feed; 
  this.callback_url = config.pubsubhubbub.callback_url_root + config.pubsubhubbub.callback_url_path + this.wsid + "/" + this.feed.id;
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
    return this.subscribers[socket_id].subscriptions;
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
                fs.readFile( config.client, function (err, data) {
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
  
  if (config.debug) printRequest( request, body );

  request.addListener("response", function(response) {
    response.addListener('end', function() {
      if(response.statusCode == 204) {
        callback();
      }
      else {
        errback();
      }
      if (config.debug) printResponse( response, body );
    });
  });
  request.end(); // Actually Perform the request
}


var subscriptions_store = new SubscriptionStore(); 

// Web Socket Server ---- (server <-> browser) --------------------------------------
var ws_server = ws.createServer({ debug: config.debug });

ws_server.addListener("listening", function() {
  var hostInfo = config.websocket.listen.host + ":" + config.websocket.listen.port.toString();
  sys.puts("Listening to WebSocket connections on ws://" + hostInfo);
});

// Handle Web Socket Subscription requests
ws_server.addListener("connection", function( conn ) {
  ws_server.send( conn._id, "Awaiting feed subscription request" );
  conn.addListener("message", function( message ) {
    
    var wsid = conn._id;
    sys.puts( "<"+wsid+"> " + message );
    
    // TODO: validate feed uri
    ws_server.send( wsid, "Subscribing to "+message );
    
    // Create the subscription
    // And attach it to the subscription store
    var sub = subscriptions_store.subscribe(wsid, message);
    subscribe(sub, "subscribe", function() {
      ws_server.send( wsid, "Subscribed to "+message );
    }, function() {
      ws_server.send( wsid, "Couldn't subscribe to "+message );
    });
  });

});

//
// Called when a WebSocket Connection is closed : we want to unsusbcribe.
ws_server.addListener("close", function( socket ) {
  var existing_subs = subscriptions_store.for_socket_id(socket.id);
  for(feed_id in existing_subs)
  {
    subscribe(existing_subs[feed_id], "unsubscribe", function() {
      sys.puts("Unsubscribed from "+ existing_subs[feed_id].feed.url );
      subscriptions_store.delete_subscription(socket.id, feed_id);
    }, function() {
      sys.puts("Couldn't unsubscribe from "+ existing_subs[feed_id].feed.url );
    });
  }
});

// Starts the Websocket Server
ws_server.listen(config.websocket.listen.port, config.websocket.listen.host);

// Web Server -------- (server <-> hub) --------------------------------------------
var web_server = express.createServer();

//
// PubSubHubbub verification of intent
web_server.get(config.pubsubhubbub.callback_url_path + ':socket_id/:subscription_id', function(req, res) {
    var subscription = subscriptions_store.subscription(req.params.socket_id, req.params.subscription_id);
    if(req.query && req.query.hub && ((req.query.hub.mode == "subscribe" && subscription) || (req.query.hub.mode == "unsubscribe" && !subscription))) {
      sys.puts("Confirmed subscription to" + req.params.subscription_id + " for " + req.params.socket_id)
      res.send(req.query.hub.challenge, 200);
    }
    else {
      sys.puts("Couldn't confirm subscription to " + req.params.subscription_id + " for " + req.params.socket_id)
      res.send(404);
    }
});

//
// Incoming POST notifications.
// Sends the data to the right Socket, based on the subscription.
web_server.post(config.pubsubhubbub.callback_url_path + ':socket_id/:subscription_id', function(req, res) {
    var subscription = subscriptions_store.subscription(req.params.socket_id, req.params.subscription_id);
    if(subscription) {
      req.on('data', function(data) {
        ws_server.send(subscription.wsid, data );
      })
      res.send("Thanks!", 200);
    }
    else {
      sys.puts("Couldn't find the susbcription from " + req.params.subscription_id + " for " + req.params.socket_id)
      res.send(404);
    }
});

web_server.addListener("listening", function() {
  var hostInfo = config.pubsubhubbub.listen.host + ":" + config.pubsubhubbub.listen.port.toString();
  sys.puts("Listening to HTTP connections on http://" + hostInfo);
});

web_server.listen(config.pubsubhubbub.listen.port, config.pubsubhubbub.listen.host);

