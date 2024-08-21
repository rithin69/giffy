const http = require('http');
const push = require('./push');

// Create HTTP Server
http.createServer((request, response) => {
  // Enable CORS for cross-origin requests
  response.setHeader('Access-Control-Allow-Origin', 'https://rithin69.github.io');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    response.writeHead(200);
    response.end();
    return;
  }

  // Get the URL and HTTP method of the request
  const { url, method } = request;

  // Handle subscription requests
  if (method === 'POST' && url.match(/^\/subscribe\/?/)) {
    let body = [];
    request.on('data', chunk => body.push(chunk)).on('end', () => {
      let subscription = JSON.parse(body.toString());
      console.log('New Subscription:', subscription);
      push.addSubscription(subscription);
      response.end('Subscribed');
    });
  }
  // Handle requests to retrieve the VAPID public key
  else if (method === 'GET' && url.match(/^\/key\/?/)) {
    const vapidKey = push.getKey();
    console.log('VAPID Public Key:', vapidKey);
    response.end(vapidKey);
  }
  // Handle requests to send a push notification
  else if (method === 'POST' && url.match(/^\/push\/?/)) {
    let body = [];
    request.on('data', chunk => body.push(chunk)).on('end', () => {
      push.send(body.toString());
      response.end('Push Sent');
    });
  }
  // Handle unknown requests (404 Not Found)
  else {
    response.statusCode = 404;
    response.end('Error: Unknown Request');
  }

}).listen(3333, () => { 
  console.log('Server Running');
});
