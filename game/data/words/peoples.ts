import type { SourceRow } from '@/lib/types';

/**
 * The tribes of Israel, spelled as the English New World Translation
 * (2013 revision) spells them. A tribe and the patriarch it is named
 * after are separate entries in separate categories, so each cites a
 * verse that speaks of the tribe rather than the man: Revelation 7:5-8
 * seals twelve of them by name, and Dan and Ephraim are cited from the
 * land allotments in Joshua.
 *
 * Familiarity: 0 household, 1 widely familiar, 2 recognisable with
 * effort, 3 uncommon, 4 obscure.
 */
export const tribeRows: SourceRow[] = [
  ['Judah', 'Revelation 7:5', 0], ['Reuben', 'Revelation 7:5', 1], ['Gad', 'Revelation 7:5', 2], ['Asher', 'Revelation 7:6', 2],
  ['Naphtali', 'Revelation 7:6', 3], ['Manasseh', 'Revelation 7:6', 2], ['Simeon', 'Revelation 7:7', 1], ['Levi', 'Revelation 7:7', 1],
  ['Issachar', 'Revelation 7:7', 3], ['Zebulun', 'Revelation 7:8', 3], ['Joseph', 'Revelation 7:8', 0], ['Benjamin', 'Revelation 7:8', 1],
  ['Dan', 'Joshua 19:40', 1], ['Ephraim', 'Joshua 16:5', 2],
];

/**
 * Peoples and nations, in the plural gentilic form the NWT uses of them.
 * Each row cites a verse where that plural form itself appears, not
 * merely where the people are in view.
 */
export const nationRows: SourceRow[] = [
  // --- The nations of Canaan and its neighbours ---
  ['Amorites', 'Genesis 15:16', 2], ['Hittites', 'Genesis 15:20', 2], ['Perizzites', 'Genesis 15:20', 4], ['Rephaim', 'Genesis 15:20', 4],
  ['Girgashites', 'Genesis 15:21', 4], ['Kenizzites', 'Genesis 15:19', 4], ['Kadmonites', 'Genesis 15:19', 4], ['Horites', 'Genesis 14:6', 4],
  ['Hivites', 'Exodus 3:8', 3], ['Jebusites', 'Joshua 15:63', 3], ['Canaanites', 'Judges 1:1', 1], ['Anakim', 'Deuteronomy 9:2', 4],
  ['Sidonians', 'Judges 3:3', 3], ['Philistines', '1 Samuel 17:1', 0],

  // --- Israel and its near kin ---
  ['Israelites', 'Exodus 1:7', 0], ['Levites', 'Numbers 3:12', 1], ['Jews', 'Esther 3:6', 0], ['Amalekites', 'Exodus 17:8', 2],
  ['Midianites', 'Judges 7:12', 2], ['Kenites', '1 Samuel 15:6', 3], ['Moabites', 'Deuteronomy 2:11', 2], ['Ammonites', 'Judges 11:4', 2],
  ['Edomites', 'Psalm 137:7', 2], ['Sabeans', 'Job 1:15', 4],

  // --- The empires ---
  ['Egyptians', 'Exodus 14:25', 0], ['Syrians', '2 Kings 5:2', 2], ['Assyrians', 'Isaiah 37:36', 1], ['Chaldeans', '2 Kings 25:4', 2],
  ['Babylonians', 'Ezra 4:9', 1], ['Medes', 'Daniel 5:28', 2], ['Persians', 'Daniel 6:8', 1], ['Elamites', 'Acts 2:9', 4],
  ['Parthians', 'Acts 2:9', 4],

  // --- Peoples of the Greek Scriptures ---
  ['Samaritans', 'John 4:9', 1], ['Galileans', 'Luke 13:1', 2], ['Gadarenes', 'Matthew 8:28', 3], ['Gerasenes', 'Mark 5:1', 4],
  ['Arabians', 'Acts 2:11', 3], ['Cretans', 'Acts 2:11', 4], ['Nazarenes', 'Acts 24:5', 4],

  // --- Phase G: deepening the hard end (long, obscure, or both) ---
  ['Ludim', 'Genesis 10:13', 4], ['Anamim', 'Genesis 10:13', 4], ['Lehabim', 'Genesis 10:13', 4],
  ['Naphtuhim', 'Genesis 10:13', 4], ['Pathrusim', 'Genesis 10:14', 4], ['Casluhim', 'Genesis 10:14', 4],
  ['Caphtorim', 'Genesis 10:14', 4], ['Zemarites', 'Genesis 10:18', 4], ['Zuzim', 'Genesis 14:5', 4],
  ['Emim', 'Genesis 14:5', 4], ['Zamzummim', 'Deuteronomy 2:20', 4], ['Avvim', 'Deuteronomy 2:23', 4],
  ['Geshurites', 'Joshua 13:13', 3], ['Gibeonites', 'Joshua 9:3', 2], ['Beerothites', '2 Samuel 4:2', 4],
  ['Jerahmeelites', '1 Samuel 27:10', 4], ['Ashdodites', 'Nehemiah 4:7', 4], ['Ishmaelites', 'Genesis 37:25', 2],
  ['Hagrites', '1 Chronicles 5:10', 4], ['Kittim', 'Genesis 10:4', 4],
];

/** No nation rows are awaiting review. `Phoenicians` was dropped: the NWT
 * names the land Phoenicia (Acts 11:19) but never its people, so the word
 * now lives in the place list instead. */
export const draftNationRows: SourceRow[] = [];
