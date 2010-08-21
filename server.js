var fs = require("fs"),
    express = require("express"),
    sys = require("sys"),
    http = require("http"),
    querystring = require("querystring"),
    url = require("url"),
    base64 = require("./deps/base64"),
    ws = require('./deps/node-websocket-server/lib/ws');


var config = JSON.parse(fs.readFileSync("./config.json", "utf8") ) || JSON.parse(fs.readFileSync("./default_config.json", "utf8") );

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

web_server.get("/", function(req, res) {
  res.send("<a href='http://github.com/julien51/socket-sub'>Socket Sub</a>", 200);
});

var subscriptions_store = new SubscriptionStore(); 
ws_server.listen(config.websocket.listen.port, config.websocket.listen.host);
web_server.listen(config.pubsubhubbub.listen.port, config.pubsubhubbub.listen.host);

