// Every message a customer can see, in one place, so the wording is easy to
// review and change. Rules: sentence case, plain words, say what happened and
// what to do next. Never say "server", "port" or "model"; say "the AI".
'use strict';

module.exports = {
  ai: {
    starting: 'The AI is getting ready. This can take a few minutes. You can use the Library and Maps meanwhile.',
    ready: 'The AI is ready.',
    disabledByOwner: 'The AI is switched off on this drive.',
    notEnoughMemory: 'This computer does not have enough memory for the AI. The Library and Maps work normally.',
    noModel: 'The AI files are missing from this drive. The Library and Maps work normally.',
    engineMissing: 'The AI program is missing from this drive. The Library and Maps work normally.',
    couldNotStart: 'The AI could not start on this computer. The Library and Maps still work.',
    stopped: 'The AI stopped working. The Library and Maps still work. To try again, close the program and start it again.',
    noBooks: 'The AI needs the books, and none were found on this drive.',
    tooSlow: 'The AI took too long to start on this computer. The Library and Maps still work.',
  },
  library: {
    starting: 'Getting the library ready…',
    noBooks: 'No books found on this drive. The folder named "library" should contain the book files. Contact the person who gave you this drive for a replacement.',
    noReadableBooks: 'The books on this drive could not be opened. The drive may be damaged. Contact the person who gave you this drive for a replacement.',
    engineMissing: 'Part of the library program is missing from this drive. Contact the person who gave you this drive for a replacement.',
    couldNotStart: 'The library could not start. Close the program, unplug the drive, plug it back in, and start again.',
    stopped: 'The library stopped working. If you unplugged the drive, plug it back in, then close the program and start it again.',
  },
  app: {
    noDrive: 'The library files could not be found next to this program. Start the program from the drive by double-clicking "Start".',
    noMaps: 'There are no maps on this drive.',
    noWebgl: 'This computer cannot draw the maps. The Library and the AI still work.',
  },
};
