const Turn = require('node-turn');
const stun = require('stun');

var server = new Turn({
  // set options
  authMech: 'long-term',
  credentials: {
    power: "to-the-people"
  },
  pokeAuthority: 'stun.l.google.com:19302',
  pokeInterval: 600 * 1000,
  debugLevel: 'TRACE'
});
server.start();

server.poke = async function() {
    const res = await stun.request(this.poke.authority),
          xaddr = res.getXorAddress();
    console.log(new Date(), xaddr.family, xaddr.address);
    this.externalIps = xaddr.address;
};

/* @todo read from config */
server.poke.authority = 'stun.l.google.com:19302';
server.poke.interval = 600 * 1000;

server.poke();
setInterval(() => server.poke(), server.poke.interval);

