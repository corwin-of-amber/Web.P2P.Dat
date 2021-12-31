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
});
server.start();

server.poke = async function() {
   const res = await stun.request(this.pokeAuthority),
          xaddr = res.getXorAddress();
    console.log(xaddr.family, xaddr.address);
    this.externalIps = xaddr.address;
};

server.poke();
setInterval(() => server.poke(), server.pokeInterval);    

