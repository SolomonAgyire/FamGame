import type { SourceRow } from '@/lib/types';

/**
 * Bible places, spelled as the English New World Translation (2013
 * revision) spells them — including its hyphenated compounds
 * (Beer-sheba, En-gedi, Ramoth-gilead) which other translations run
 * together. Each row cites a verse where the name itself appears.
 *
 * Familiarity: 0 household, 1 widely familiar, 2 recognisable with
 * effort, 3 uncommon, 4 obscure.
 */
export const placeRows: SourceRow[] = [
  // --- The original approved set ---
  ['Eden', 'Genesis 2:8', 0], ['Ararat', 'Genesis 8:4', 1], ['Babel', 'Genesis 11:9', 1], ['Ur', 'Genesis 11:31', 2],
  ['Canaan', 'Genesis 12:5', 0], ['Egypt', 'Genesis 12:10', 0], ['Goshen', 'Genesis 47:1', 2], ['Sinai', 'Exodus 19:1', 0],
  ['Midian', 'Exodus 2:15', 3], ['Jericho', 'Joshua 2:1', 0], ['Hebron', 'Joshua 10:36', 1], ['Shechem', 'Joshua 17:7', 2],
  ['Bethel', 'Genesis 28:19', 1], ['Ai', 'Joshua 7:2', 2], ['Jerusalem', '2 Samuel 5:5', 0], ['Bethlehem', 'Micah 5:2', 0],
  ['Nazareth', 'Matthew 2:23', 0], ['Galilee', 'Matthew 2:22', 0], ['Samaria', 'John 4:4', 1], ['Judea', 'Matthew 2:1', 1],
  ['Jordan', 'Matthew 3:5', 0], ['Gethsemane', 'Matthew 26:36', 1], ['Golgotha', 'Matthew 27:33', 1], ['Bethany', 'John 11:1', 1],
  ['Carmel', '1 Kings 18:19', 1], ['Nineveh', 'Jonah 1:2', 1], ['Babylon', '2 Kings 24:1', 0], ['Shushan', 'Esther 1:2', 3],
  ['Moab', 'Ruth 1:1', 1], ['Edom', 'Genesis 36:1', 1], ['Damascus', 'Acts 9:2', 0], ['Antioch', 'Acts 11:26', 1],
  ['Corinth', 'Acts 18:1', 1], ['Ephesus', 'Acts 18:19', 1], ['Philippi', 'Acts 16:12', 1], ['Rome', 'Acts 28:14', 0],
  ['Malta', 'Acts 28:1', 1], ['Patmos', 'Revelation 1:9', 1], ['Tarsus', 'Acts 9:11', 2], ['Joppa', 'Acts 9:36', 2],
  ['Caesarea', 'Acts 10:1', 1],

  // --- Patriarchal era ---
  ['Havilah', 'Genesis 2:11', 4], ['Cush', 'Genesis 2:13', 3], ['Euphrates', 'Genesis 2:14', 2], ['Calah', 'Genesis 10:11', 4],
  ['Haran', 'Genesis 12:4', 2], ['Sodom', 'Genesis 13:12', 0], ['Elam', 'Genesis 14:1', 3], ['Zoar', 'Genesis 19:22', 4],
  ['Gomorrah', 'Genesis 19:24', 1], ['Gerar', 'Genesis 20:1', 4], ['Beer-sheba', 'Genesis 21:31', 2], ['Moriah', 'Genesis 22:2', 3],
  ['Gilead', 'Genesis 31:21', 2], ['Seir', 'Genesis 32:3', 3], ['Jabbok', 'Genesis 32:22', 4], ['Peniel', 'Genesis 32:30', 3],
  ['Succoth', 'Genesis 33:17', 3], ['Dothan', 'Genesis 37:17', 3], ['Rameses', 'Genesis 47:11', 3],

  // --- Exodus and the wilderness ---
  ['Pithom', 'Exodus 1:11', 4], ['Nile', 'Exodus 1:22', 1], ['Horeb', 'Exodus 3:1', 2], ['Philistia', 'Exodus 15:14', 2],
  ['Marah', 'Exodus 15:23', 3], ['Elim', 'Exodus 15:27', 4], ['Rephidim', 'Exodus 17:1', 4], ['Paran', 'Numbers 13:3', 3],
  ['Kadesh', 'Numbers 20:1', 3], ['Zin', 'Numbers 20:1', 4], ['Arad', 'Numbers 21:1', 4], ['Hormah', 'Numbers 21:3', 4],
  ['Arnon', 'Numbers 21:13', 4], ['Jahaz', 'Numbers 21:23', 4], ['Heshbon', 'Numbers 21:25', 3], ['Bashan', 'Numbers 21:33', 2],
  ['Edrei', 'Numbers 21:33', 4], ['Pethor', 'Numbers 22:5', 4], ['Shittim', 'Numbers 25:1', 4], ['Kadesh-barnea', 'Numbers 32:8', 4],
  ['Ashtaroth', 'Deuteronomy 1:4', 4], ['Hermon', 'Deuteronomy 3:8', 2], ['Ebal', 'Deuteronomy 11:29', 3], ['Gerizim', 'Deuteronomy 11:29', 3],
  ['Nebo', 'Deuteronomy 32:49', 2], ['Pisgah', 'Deuteronomy 34:1', 3], ['Beth-peor', 'Deuteronomy 34:6', 4],

  // --- Conquest and the judges ---
  ['Gilgal', 'Joshua 4:19', 2], ['Gibeon', 'Joshua 9:3', 2], ['Lachish', 'Joshua 10:3', 3], ['Jarmuth', 'Joshua 10:3', 4],
  ['Eglon', 'Joshua 10:3', 4], ['Beth-horon', 'Joshua 10:10', 4], ['Aijalon', 'Joshua 10:12', 3], ['Libnah', 'Joshua 10:29', 4],
  ['Debir', 'Joshua 10:38', 4], ['Hazor', 'Joshua 11:1', 3], ['Gezer', 'Joshua 16:10', 4], ['Shiloh', 'Joshua 18:1', 2],
  ['Kishon', 'Judges 4:7', 4], ['Taanach', 'Judges 5:19', 4], ['Ophrah', 'Judges 6:11', 4], ['Zorah', 'Judges 13:2', 4],
  ['Eshtaol', 'Judges 13:25', 4], ['Timnah', 'Judges 14:1', 4], ['Ashkelon', 'Judges 14:19', 2], ['Gaza', 'Judges 16:21', 1],

  // --- The kingdom ---
  ['Aphek', '1 Samuel 4:1', 4], ['Ashdod', '1 Samuel 5:1', 3], ['Ekron', '1 Samuel 5:10', 3], ['Beth-shemesh', '1 Samuel 6:12', 4],
  ['Kiriath-jearim', '1 Samuel 7:1', 4], ['Mizpah', '1 Samuel 7:5', 3], ['Ebenezer', '1 Samuel 7:12', 3], ['Ramah', '1 Samuel 7:17', 3],
  ['Jabesh', '1 Samuel 11:3', 4], ['Gibeah', '1 Samuel 11:4', 3], ['Michmash', '1 Samuel 13:2', 4], ['Elah', '1 Samuel 17:2', 3],
  ['Gath', '1 Samuel 17:4', 2], ['Adullam', '1 Samuel 22:1', 3], ['Ziph', '1 Samuel 23:14', 4], ['Maon', '1 Samuel 23:24', 4],
  ['En-gedi', '1 Samuel 24:1', 3], ['Ziklag', '1 Samuel 27:6', 4], ['En-dor', '1 Samuel 28:7', 3], ['Gilboa', '1 Samuel 31:1', 3],
  ['Beth-shan', '1 Samuel 31:10', 4], ['Zion', '2 Samuel 5:7', 0], ['Kidron', '2 Samuel 15:23', 3], ['Gihon', '1 Kings 1:33', 3],
  ['Tyre', '1 Kings 5:1', 1], ['Lebanon', '1 Kings 5:6', 1], ['Ezion-geber', '1 Kings 9:26', 4], ['Ophir', '1 Kings 9:28', 3],
  ['Sheba', '1 Kings 10:1', 2], ['Tirzah', '1 Kings 15:33', 4], ['Zarephath', '1 Kings 17:9', 3], ['Abel-meholah', '1 Kings 19:16', 4],
  ['Jezreel', '1 Kings 21:1', 2], ['Ramoth-gilead', '1 Kings 22:3', 3], ['Sela', '2 Kings 14:7', 4], ['Elath', '2 Kings 14:22', 4],
  ['Gath-hepher', '2 Kings 14:25', 4], ['Assyria', '2 Kings 17:6', 1], ['Megiddo', '2 Kings 23:29', 2], ['Riblah', '2 Kings 25:6', 4],

  // --- Exile, return and the nations round about ---
  ['Ophel', 'Nehemiah 3:26', 4], ['Ono', 'Nehemiah 6:2', 4], ['Lod', 'Nehemiah 7:37', 4], ['Persia', 'Ezra 1:1', 1],
  ['Ecbatana', 'Ezra 6:2', 4], ['India', 'Esther 1:1', 2], ['Ethiopia', 'Esther 1:1', 1], ['Media', 'Esther 1:3', 2],
  ['Uz', 'Job 1:1', 3], ['Ammon', 'Psalm 83:7', 2], ['Bozrah', 'Isaiah 63:1', 4], ['Carchemish', 'Jeremiah 46:2', 4],
  ['Teman', 'Jeremiah 49:7', 4], ['Chebar', 'Ezekiel 1:1', 4], ['Put', 'Ezekiel 27:10', 4], ['Dedan', 'Ezekiel 27:20', 4],
  ['Tarshish', 'Jonah 1:3', 2], ['Tekoa', 'Amos 1:1', 4], ['Kir', 'Amos 1:5', 4],

  // --- Greek Scriptures: the ministry ---
  ['Capernaum', 'Matthew 4:13', 1], ['Syria', 'Matthew 4:24', 1], ['Chorazin', 'Matthew 11:21', 3], ['Sidon', 'Matthew 11:21', 1],
  ['Magadan', 'Matthew 15:39', 4], ['Caesarea Philippi', 'Matthew 16:13', 2], ['Bethphage', 'Matthew 21:1', 3], ['Idumea', 'Mark 3:8', 4],
  ['Decapolis', 'Mark 5:20', 3], ['Bethsaida', 'Mark 8:22', 2], ['Nain', 'Luke 7:11', 3], ['Emmaus', 'Luke 24:13', 2],
  ['Cana', 'John 2:1', 1], ['Sychar', 'John 4:5', 3], ['Siloam', 'John 9:7', 2],

  // --- Greek Scriptures: the spread of the good news ---
  ['Mesopotamia', 'Acts 2:9', 3], ['Cyrene', 'Acts 2:10', 3], ['Libya', 'Acts 2:10', 3], ['Lydda', 'Acts 9:32', 3],
  ['Phoenicia', 'Acts 11:19', 3], ['Cyprus', 'Acts 13:4', 2], ['Seleucia', 'Acts 13:4', 4], ['Salamis', 'Acts 13:5', 4],
  ['Paphos', 'Acts 13:6', 4], ['Perga', 'Acts 13:13', 4], ['Pamphylia', 'Acts 13:13', 4], ['Pisidia', 'Acts 13:14', 4],
  ['Iconium', 'Acts 13:51', 3], ['Lystra', 'Acts 14:6', 3], ['Lycaonia', 'Acts 14:6', 4], ['Derbe', 'Acts 14:20', 3],
  ['Attalia', 'Acts 14:25', 4], ['Phrygia', 'Acts 16:6', 3], ['Mysia', 'Acts 16:7', 4], ['Bithynia', 'Acts 16:7', 3],
  ['Troas', 'Acts 16:8', 3], ['Macedonia', 'Acts 16:9', 1], ['Samothrace', 'Acts 16:11', 4], ['Neapolis', 'Acts 16:11', 4],
  ['Amphipolis', 'Acts 17:1', 4], ['Thessalonica', 'Acts 17:1', 1], ['Berea', 'Acts 17:10', 2], ['Athens', 'Acts 17:15', 0],
  ['Pontus', 'Acts 18:2', 3], ['Achaia', 'Acts 18:12', 3], ['Cenchreae', 'Acts 18:18', 4], ['Alexandria', 'Acts 18:24', 2],
  ['Asia', 'Acts 19:10', 1], ['Assos', 'Acts 20:13', 4], ['Mitylene', 'Acts 20:14', 4], ['Chios', 'Acts 20:15', 4],
  ['Samos', 'Acts 20:15', 4], ['Miletus', 'Acts 20:15', 3], ['Cos', 'Acts 21:1', 4], ['Rhodes', 'Acts 21:1', 2],
  ['Patara', 'Acts 21:1', 4], ['Cilicia', 'Acts 21:39', 3], ['Myra', 'Acts 27:5', 4], ['Lycia', 'Acts 27:5', 4],
  ['Cnidus', 'Acts 27:7', 4], ['Crete', 'Acts 27:7', 1], ['Fair Havens', 'Acts 27:8', 4], ['Syracuse', 'Acts 28:12', 3],
  ['Rhegium', 'Acts 28:13', 4], ['Puteoli', 'Acts 28:13', 4],

  // --- Greek Scriptures: the letters and Revelation ---
  ['Illyricum', 'Romans 15:19', 4], ['Spain', 'Romans 15:24', 2], ['Arabia', 'Galatians 1:17', 2], ['Galatia', 'Galatians 1:2', 2],
  ['Colossae', 'Colossians 1:2', 3], ['Hierapolis', 'Colossians 4:13', 4], ['Dalmatia', '2 Timothy 4:10', 4], ['Nicopolis', 'Titus 3:12', 4],
  ['Cappadocia', '1 Peter 1:1', 3], ['Smyrna', 'Revelation 2:8', 2], ['Pergamum', 'Revelation 2:12', 3], ['Thyatira', 'Revelation 2:18', 3],
  ['Sardis', 'Revelation 3:1', 3], ['Philadelphia', 'Revelation 3:7', 2], ['Laodicea', 'Revelation 3:14', 2],
  ['Asshur', 'Ezekiel 27:23', 4], ['Tigris', 'Daniel 10:4', 2], ['Memphis', 'Hosea 9:6', 3],
];

/** No place rows are awaiting review: the three that were held back
 * (Asshur, Tigris, Memphis) were confirmed against the NWT and promoted. */
export const draftPlaceRows: SourceRow[] = [];
