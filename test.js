'use strict';

function foobar(x, ...args) {
  console.log(`${' '.repeat(x)}${args.join(' ')}`);
}

foobar(1, 'a', 'b', 'c');
