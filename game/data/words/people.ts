import type { SourceRow } from '@/lib/types';

/**
 * Bible persons, spelled as the English New World Translation (2013
 * revision) spells them. Each row carries the reference where the name
 * itself appears, not merely where the account is told.
 *
 * Familiarity: 0 household, 1 widely familiar, 2 recognisable with
 * effort, 3 uncommon, 4 obscure.
 */
export const peopleRows: SourceRow[] = [
  // --- The original approved set ---
  ['Abraham', 'Genesis 17:5', 0], ['Sarah', 'Genesis 17:15', 0], ['Isaac', 'Genesis 21:3', 0], ['Rebekah', 'Genesis 24:15', 1],
  ['Jacob', 'Genesis 25:26', 0], ['Joseph', 'Genesis 30:24', 0], ['Moses', 'Exodus 3:4', 0], ['Aaron', 'Exodus 4:14', 0],
  ['Miriam', 'Exodus 15:20', 1], ['Joshua', 'Joshua 1:1', 0], ['Rahab', 'Joshua 2:1', 1], ['Gideon', 'Judges 6:11', 1],
  ['Samson', 'Judges 13:24', 0], ['Ruth', 'Ruth 1:4', 0], ['Naomi', 'Ruth 1:2', 1], ['Boaz', 'Ruth 2:1', 1],
  ['Samuel', '1 Samuel 1:20', 0], ['Saul', '1 Samuel 9:2', 0], ['David', '1 Samuel 16:13', 0], ['Jonathan', '1 Samuel 18:1', 1],
  ['Abigail', '1 Samuel 25:3', 1], ['Solomon', '2 Samuel 12:24', 0], ['Elijah', '1 Kings 17:1', 0], ['Elisha', '1 Kings 19:16', 1],
  ['Hezekiah', '2 Kings 18:1', 1], ['Josiah', '2 Kings 22:1', 1], ['Ezra', 'Ezra 7:1', 1], ['Nehemiah', 'Nehemiah 1:1', 1],
  ['Esther', 'Esther 2:7', 0], ['Mordecai', 'Esther 2:5', 3], ['Job', 'Job 1:1', 0], ['Isaiah', 'Isaiah 1:1', 0],
  ['Jeremiah', 'Jeremiah 1:1', 0], ['Ezekiel', 'Ezekiel 1:3', 1], ['Daniel', 'Daniel 1:6', 0], ['Hosea', 'Hosea 1:1', 1],
  ['Jonah', 'Jonah 1:1', 0], ['Mary', 'Matthew 1:16', 0], ['Elizabeth', 'Luke 1:5', 1], ['Zechariah', 'Luke 1:5', 1],
  ['Jesus', 'Matthew 1:21', 0], ['Peter', 'Matthew 4:18', 0], ['Andrew', 'Matthew 4:18', 0], ['James', 'Matthew 4:21', 1],
  ['Philip', 'John 1:43', 1], ['Nathanael', 'John 1:45', 2], ['Martha', 'Luke 10:38', 1], ['Lazarus', 'John 11:1', 1],
  ['Paul', 'Acts 13:9', 0], ['Barnabas', 'Acts 4:36', 1], ['Timothy', 'Acts 16:1', 1], ['Lydia', 'Acts 16:14', 1],
  ['Priscilla', 'Acts 18:2', 1], ['Aquila', 'Acts 18:2', 2], ['Stephen', 'Acts 6:5', 1], ['Phoebe', 'Romans 16:1', 2],
  ['Lois', '2 Timothy 1:5', 2], ['Eunice', '2 Timothy 1:5', 2],

  // --- Patriarchs and family ---
  ['Adam', 'Genesis 5:1', 0], ['Eve', 'Genesis 3:20', 0], ['Cain', 'Genesis 4:1', 0], ['Abel', 'Genesis 4:2', 0],
  ['Seth', 'Genesis 4:25', 1], ['Enosh', 'Genesis 5:6', 4], ['Kenan', 'Genesis 5:9', 4], ['Mahalalel', 'Genesis 5:12', 4],
  ['Jared', 'Genesis 5:15', 3], ['Enoch', 'Genesis 5:24', 1], ['Methuselah', 'Genesis 5:27', 1], ['Lamech', 'Genesis 5:25', 3],
  ['Noah', 'Genesis 6:9', 0], ['Shem', 'Genesis 9:26', 1], ['Ham', 'Genesis 9:22', 1], ['Japheth', 'Genesis 9:27', 2],
  ['Nimrod', 'Genesis 10:8', 2], ['Terah', 'Genesis 11:26', 3], ['Nahor', 'Genesis 11:26', 4], ['Haran', 'Genesis 11:27', 3],
  ['Milcah', 'Genesis 11:29', 4], ['Sarai', 'Genesis 11:29', 2], ['Abram', 'Genesis 12:1', 1], ['Lot', 'Genesis 19:1', 0],
  ['Melchizedek', 'Genesis 14:18', 4], ['Eliezer', 'Genesis 15:2', 3], ['Hagar', 'Genesis 16:1', 1], ['Ishmael', 'Genesis 16:15', 1],
  ['Bethuel', 'Genesis 22:22', 4], ['Keturah', 'Genesis 25:1', 4], ['Esau', 'Genesis 25:25', 1], ['Laban', 'Genesis 29:13', 2],
  ['Leah', 'Genesis 29:23', 1], ['Rachel', 'Genesis 29:28', 1], ['Zilpah', 'Genesis 29:24', 4], ['Bilhah', 'Genesis 29:29', 4],
  ['Reuben', 'Genesis 29:32', 1], ['Simeon', 'Genesis 29:33', 1], ['Levi', 'Genesis 29:34', 1], ['Judah', 'Genesis 29:35', 1],
  ['Dan', 'Genesis 30:6', 1], ['Naphtali', 'Genesis 30:8', 3], ['Gad', 'Genesis 30:11', 2], ['Asher', 'Genesis 30:13', 2],
  ['Issachar', 'Genesis 30:18', 3], ['Zebulun', 'Genesis 30:20', 3], ['Dinah', 'Genesis 30:21', 3], ['Benjamin', 'Genesis 35:18', 1],
  ['Er', 'Genesis 38:3', 4], ['Onan', 'Genesis 38:4', 4], ['Tamar', 'Genesis 38:6', 2], ['Perez', 'Genesis 38:29', 3],
  ['Zerah', 'Genesis 38:30', 4], ['Potiphar', 'Genesis 39:1', 2], ['Asenath', 'Genesis 41:45', 4], ['Manasseh', 'Genesis 41:51', 2],
  ['Ephraim', 'Genesis 41:52', 2], ['Machir', 'Genesis 50:23', 4],

  // --- Exodus and the wilderness ---
  ['Zipporah', 'Exodus 2:21', 2], ['Jethro', 'Exodus 3:1', 2], ['Amram', 'Exodus 6:18', 3], ['Jochebed', 'Exodus 6:20', 2],
  ['Hur', 'Exodus 17:10', 3], ['Bezalel', 'Exodus 31:2', 3], ['Oholiab', 'Exodus 31:6', 4], ['Nun', 'Exodus 33:11', 3],
  ['Ithamar', 'Exodus 38:21', 4], ['Nadab', 'Leviticus 10:1', 3], ['Abihu', 'Numbers 3:4', 3], ['Eleazar', 'Numbers 20:26', 2],
  ['Eldad', 'Numbers 11:26', 4], ['Medad', 'Numbers 11:27', 4], ['Caleb', 'Numbers 13:6', 1], ['Korah', 'Numbers 16:1', 2],
  ['Dathan', 'Numbers 16:12', 4], ['Abiram', 'Numbers 16:27', 4], ['Sihon', 'Numbers 21:21', 3], ['Og', 'Numbers 21:33', 3],
  ['Balak', 'Numbers 22:4', 3], ['Balaam', 'Numbers 22:5', 2], ['Phinehas', 'Numbers 25:7', 3], ['Zelophehad', 'Numbers 27:1', 4],
  ['Achan', 'Joshua 7:1', 2], ['Achsah', 'Joshua 15:16', 4],

  // --- The judges ---
  ['Othniel', 'Judges 3:9', 3], ['Eglon', 'Judges 3:12', 3], ['Ehud', 'Judges 3:15', 3], ['Shamgar', 'Judges 3:31', 3],
  ['Sisera', 'Judges 4:2', 2], ['Deborah', 'Judges 4:4', 1], ['Barak', 'Judges 4:6', 2], ['Jael', 'Judges 4:17', 2],
  ['Jerubbaal', 'Judges 6:32', 4], ['Joash', 'Judges 6:11', 3], ['Abimelech', 'Judges 9:1', 2], ['Gaal', 'Judges 9:26', 4],
  ['Tola', 'Judges 10:1', 4], ['Jair', 'Judges 10:3', 4], ['Jephthah', 'Judges 11:1', 2], ['Ibzan', 'Judges 12:8', 4],
  ['Elon', 'Judges 12:11', 4], ['Abdon', 'Judges 12:13', 4], ['Manoah', 'Judges 13:2', 3], ['Delilah', 'Judges 16:4', 1],
  ['Micah', 'Judges 17:1', 2], ['Elkanah', '1 Samuel 1:1', 3], ['Hannah', '1 Samuel 1:2', 1], ['Hophni', '1 Samuel 1:3', 3],
  ['Peninnah', '1 Samuel 1:4', 4], ['Eli', '1 Samuel 1:9', 1],

  // --- The united and divided kingdoms ---
  ['Abner', '1 Samuel 14:50', 2], ['Jesse', '1 Samuel 16:1', 1], ['Merab', '1 Samuel 18:17', 4], ['Michal', '1 Samuel 18:20', 2],
  ['Ahimelech', '1 Samuel 21:1', 4], ['Doeg', '1 Samuel 21:7', 4], ['Nabal', '1 Samuel 25:3', 3], ['Uzzah', '2 Samuel 6:6', 3],
  ['Ziba', '2 Samuel 9:2', 4], ['Mephibosheth', '2 Samuel 9:6', 3], ['Joab', '2 Samuel 2:13', 2], ['Abishai', '2 Samuel 10:10', 4],
  ['Uriah', '2 Samuel 11:3', 2], ['Bath-sheba', '2 Samuel 11:3', 1], ['Nathan', '2 Samuel 12:1', 1], ['Absalom', '2 Samuel 13:1', 1],
  ['Amnon', '2 Samuel 13:2', 3], ['Ahithophel', '2 Samuel 15:12', 3], ['Ittai', '2 Samuel 15:19', 4], ['Hushai', '2 Samuel 15:32', 4],
  ['Shimei', '2 Samuel 16:5', 3], ['Amasa', '2 Samuel 17:25', 4], ['Barzillai', '2 Samuel 17:27', 4], ['Sheba', '2 Samuel 20:1', 3],
  ['Adonijah', '1 Kings 1:5', 3], ['Abiathar', '1 Kings 1:7', 3], ['Zadok', '1 Kings 1:8', 3], ['Benaiah', '1 Kings 2:35', 3],
  ['Hiram', '1 Kings 5:1', 2], ['Jeroboam', '1 Kings 11:26', 2], ['Rehoboam', '1 Kings 11:43', 2], ['Shishak', '1 Kings 14:25', 4],
  ['Asa', '1 Kings 15:9', 2], ['Baasha', '1 Kings 15:16', 4], ['Elah', '1 Kings 16:8', 4], ['Zimri', '1 Kings 16:15', 4],
  ['Omri', '1 Kings 16:16', 3], ['Tibni', '1 Kings 16:21', 4], ['Ahab', '1 Kings 16:29', 1], ['Jezebel', '1 Kings 16:31', 1],
  ['Obadiah', '1 Kings 18:3', 2], ['Hazael', '1 Kings 19:15', 3], ['Ben-hadad', '1 Kings 20:1', 3], ['Naboth', '1 Kings 21:1', 2],
  ['Micaiah', '1 Kings 22:8', 3], ['Jehoshaphat', '1 Kings 22:41', 2], ['Gehazi', '2 Kings 4:12', 3], ['Naaman', '2 Kings 5:1', 2],
  ['Jehoram', '2 Kings 8:16', 3], ['Ahaziah', '2 Kings 8:25', 3], ['Jehu', '2 Kings 9:2', 2], ['Athaliah', '2 Kings 11:1', 3],
  ['Jehoiada', '2 Kings 11:4', 3], ['Amaziah', '2 Kings 14:1', 3], ['Uzziah', 'Isaiah 6:1', 2], ['Jotham', '2 Kings 15:32', 3],
  ['Ahaz', '2 Kings 16:1', 2], ['Sennacherib', '2 Kings 18:13', 2], ['Eliakim', '2 Kings 18:18', 4], ['Shebna', 'Isaiah 22:15', 4],
  ['Amon', '2 Kings 21:19', 3], ['Hilkiah', '2 Kings 22:4', 3], ['Shaphan', '2 Kings 22:8', 4], ['Huldah', '2 Kings 22:14', 3],
  ['Jehoahaz', '2 Kings 23:31', 3], ['Jehoiakim', '2 Kings 23:34', 2], ['Jehoiachin', '2 Kings 24:8', 3], ['Zedekiah', '2 Kings 24:17', 2],
  ['Nebuzaradan', '2 Kings 25:8', 4], ['Gedaliah', '2 Kings 25:22', 4], ['Evil-merodach', '2 Kings 25:27', 4], ['Abijah', '2 Chronicles 13:1', 3],
  ['Jabez', '1 Chronicles 4:9', 3], ['Heman', '1 Chronicles 6:33', 4], ['Asaph', '1 Chronicles 16:5', 3], ['Jeduthun', '1 Chronicles 16:41', 4],

  // --- Exile, return and the Persian court ---
  ['Nebuchadnezzar', 'Daniel 1:1', 1], ['Azariah', 'Daniel 1:6', 3], ['Mishael', 'Daniel 1:6', 4], ['Shadrach', 'Daniel 1:7', 1],
  ['Arioch', 'Daniel 2:14', 4], ['Meshach', 'Daniel 3:16', 1], ['Abednego', 'Daniel 3:26', 1], ['Belshazzar', 'Daniel 5:1', 2],
  ['Darius', 'Daniel 6:1', 2], ['Gabriel', 'Daniel 8:16', 1], ['Michael', 'Daniel 10:13', 1], ['Cyrus', 'Ezra 1:1', 2],
  ['Jeshua', 'Ezra 2:2', 3], ['Zerubbabel', 'Ezra 3:2', 3], ['Shealtiel', 'Ezra 3:2', 4], ['Haggai', 'Ezra 5:1', 2],
  ['Artaxerxes', 'Ezra 7:1', 3], ['Hanani', 'Nehemiah 1:2', 4], ['Sanballat', 'Nehemiah 2:10', 3], ['Eliashib', 'Nehemiah 3:1', 4],
  ['Tobiah', 'Nehemiah 4:3', 3], ['Shemaiah', 'Nehemiah 6:10', 4], ['Ahasuerus', 'Esther 1:1', 2], ['Vashti', 'Esther 1:9', 2],
  ['Memucan', 'Esther 1:14', 4], ['Hegai', 'Esther 2:8', 4], ['Haman', 'Esther 3:1', 1],

  // --- Prophets, writers and their households ---
  ['Elimelech', 'Ruth 1:2', 3], ['Orpah', 'Ruth 1:4', 2], ['Obed', 'Ruth 4:17', 3], ['Joel', '1 Samuel 8:2', 2],
  ['Amoz', 'Isaiah 1:1', 4], ['Hananiah', 'Jeremiah 28:1', 3], ['Baruch', 'Jeremiah 36:4', 3], ['Ebed-melech', 'Jeremiah 38:7', 4],
  ['Amos', 'Amos 7:14', 2], ['Nahum', 'Nahum 1:1', 3], ['Habakkuk', 'Habakkuk 1:1', 2], ['Zephaniah', 'Zephaniah 1:1', 3],
  ['Malachi', 'Malachi 1:1', 2], ['Bildad', 'Job 2:11', 3], ['Eliphaz', 'Job 2:11', 3], ['Zophar', 'Job 2:11', 3],
  ['Elihu', 'Job 32:2', 3],

  // --- Greek Scriptures ---
  ['Herod', 'Matthew 2:1', 1], ['John', 'Matthew 4:21', 0], ['Zebedee', 'Matthew 4:21', 2], ['Matthew', 'Matthew 9:9', 0],
  ['Thaddaeus', 'Matthew 10:3', 2], ['Simon', 'Matthew 10:4', 1], ['Herodias', 'Matthew 14:3', 2], ['Caiaphas', 'Matthew 26:3', 2],
  ['Judas', 'Matthew 26:14', 1], ['Pilate', 'Matthew 27:2', 0], ['Barabbas', 'Matthew 27:16', 1], ['Bartholomew', 'Mark 3:18', 2],
  ['Jairus', 'Mark 5:22', 2], ['Bartimaeus', 'Mark 10:46', 2], ['Salome', 'Mark 15:40', 3], ['Theophilus', 'Luke 1:3', 3],
  ['Augustus', 'Luke 2:1', 2], ['Anna', 'Luke 2:36', 2], ['Tiberius', 'Luke 3:1', 3], ['Annas', 'Luke 3:2', 2],
  ['Joanna', 'Luke 8:3', 3], ['Susanna', 'Luke 8:3', 3], ['Zacchaeus', 'Luke 19:2', 1], ['Nicodemus', 'John 3:1', 1],
  ['Thomas', 'John 20:24', 0], ['Matthias', 'Acts 1:26', 2], ['Sapphira', 'Acts 5:1', 2], ['Ananias', 'Acts 5:3', 2],
  ['Tabitha', 'Acts 9:36', 2], ['Dorcas', 'Acts 9:39', 2], ['Cornelius', 'Acts 10:1', 1], ['Agabus', 'Acts 11:28', 3],
  ['Claudius', 'Acts 11:28', 3], ['Rhoda', 'Acts 12:13', 3], ['Blastus', 'Acts 12:20', 4], ['Mark', 'Acts 12:25', 0],
  ['Lucius', 'Acts 13:1', 4], ['Manaen', 'Acts 13:1', 4], ['Sergius Paulus', 'Acts 13:7', 4], ['Elymas', 'Acts 13:8', 4],
  ['Silas', 'Acts 15:22', 1], ['Jason', 'Acts 17:5', 3], ['Dionysius', 'Acts 17:34', 4], ['Damaris', 'Acts 17:34', 4],
  ['Crispus', 'Acts 18:8', 4], ['Gallio', 'Acts 18:12', 3], ['Sosthenes', 'Acts 18:17', 4], ['Apollos', 'Acts 18:24', 2],
  ['Sceva', 'Acts 19:14', 4], ['Erastus', 'Acts 19:22', 3], ['Demetrius', 'Acts 19:24', 3], ['Aristarchus', 'Acts 19:29', 3],
  ['Gaius', 'Acts 19:29', 3], ['Alexander', 'Acts 19:33', 2], ['Sopater', 'Acts 20:4', 4], ['Secundus', 'Acts 20:4', 4],
  ['Eutychus', 'Acts 20:9', 3], ['Mnason', 'Acts 21:16', 4], ['Trophimus', 'Acts 21:29', 4], ['Felix', 'Acts 23:24', 2],
  ['Lysias', 'Acts 23:26', 4], ['Tertullus', 'Acts 24:1', 4], ['Drusilla', 'Acts 24:24', 4], ['Festus', 'Acts 24:27', 2],
  ['Agrippa', 'Acts 25:13', 2], ['Bernice', 'Acts 25:13', 4], ['Julius', 'Acts 27:1', 4], ['Publius', 'Acts 28:7', 4],
  ['Andronicus', 'Romans 16:7', 4], ['Urbanus', 'Romans 16:9', 4], ['Tryphaena', 'Romans 16:12', 4], ['Persis', 'Romans 16:12', 4],
  ['Rufus', 'Romans 16:13', 4], ['Tertius', 'Romans 16:22', 4], ['Quartus', 'Romans 16:23', 4], ['Chloe', '1 Corinthians 1:11', 4],
  ['Stephanas', '1 Corinthians 16:15', 4], ['Achaicus', '1 Corinthians 16:17', 4], ['Fortunatus', '1 Corinthians 16:17', 4], ['Titus', 'Galatians 2:1', 1],
  ['Tychicus', 'Ephesians 6:21', 3], ['Epaphroditus', 'Philippians 2:25', 3], ['Euodia', 'Philippians 4:2', 3], ['Syntyche', 'Philippians 4:2', 3],
  ['Clement', 'Philippians 4:3', 4], ['Epaphras', 'Colossians 1:7', 3], ['Onesimus', 'Colossians 4:9', 2], ['Demas', 'Colossians 4:14', 3],
  ['Luke', 'Colossians 4:14', 0], ['Nympha', 'Colossians 4:15', 4], ['Archippus', 'Colossians 4:17', 4], ['Hymenaeus', '1 Timothy 1:20', 4],
  ['Onesiphorus', '2 Timothy 1:16', 4], ['Philetus', '2 Timothy 2:17', 4], ['Claudia', '2 Timothy 4:21', 4], ['Linus', '2 Timothy 4:21', 4],
  ['Pudens', '2 Timothy 4:21', 4], ['Artemas', 'Titus 3:12', 4], ['Zenas', 'Titus 3:13', 4], ['Philemon', 'Philemon 1:1', 2],
  ['Jude', 'Jude 1:1', 1], ['Diotrephes', '3 John 1:9', 4],
  ['Junias', 'Romans 16:7', 4],

  // --- Phase G: deepening the hard end (long, obscure, or both) ---
  ['Chedorlaomer', 'Genesis 14:1', 4], ['Amraphel', 'Genesis 14:1', 4], ['Hazarmaveth', 'Genesis 10:26', 4],
  ['Adoni-zedek', 'Joshua 10:1', 4],
  ['Maher-shalal-hash-baz', 'Isaiah 8:3', 3], ['Belteshazzar', 'Daniel 1:7', 2],
  ['Esarhaddon', '2 Kings 19:37', 4], ['Merodach-baladan', 'Isaiah 39:1', 4],
  ['Rabsaris', '2 Kings 18:17', 4], ['Rabshakeh', '2 Kings 18:17', 3],
  ['Tiglath-pileser', '2 Kings 15:29', 3], ['Tilgath-pilneser', '1 Chronicles 5:26', 4],
  ['Nebushazban', 'Jeremiah 39:13', 4], ['Malchijah', 'Jeremiah 38:6', 4],
  ['Meshullam', '2 Kings 22:3', 4], ['Nethaniah', '2 Kings 25:23', 4],
  ['Pedaiah', '1 Chronicles 3:19', 4], ['Shephatiah', '2 Samuel 3:4', 4],
  ['Ahimaaz', '2 Samuel 15:27', 3], ['Jehozabad', '2 Kings 12:21', 4],
  ['Shelemiah', 'Jeremiah 36:14', 4], ['Sheshbazzar', 'Ezra 1:8', 3],
  ['Tattenai', 'Ezra 5:3', 4], ['Shethar-bozenai', 'Ezra 5:3', 4],
  ['Harbonah', 'Esther 1:10', 4], ['Zeresh', 'Esther 5:10', 3],
  ['Parshandatha', 'Esther 9:7', 4], ['Dalphon', 'Esther 9:7', 4], ['Aspatha', 'Esther 9:7', 4],
  ['Poratha', 'Esther 9:8', 4], ['Adalia', 'Esther 9:8', 4], ['Aridatha', 'Esther 9:8', 4],
  ['Parmashta', 'Esther 9:9', 4], ['Arisai', 'Esther 9:9', 4], ['Aridai', 'Esther 9:9', 4], ['Vaizatha', 'Esther 9:9', 4],
  ['Jehoash', '2 Kings 12:1', 3], ['Hamutal', '2 Kings 23:31', 4], ['Zebidah', '2 Kings 23:36', 4],
  ['Nehushta', '2 Kings 24:8', 4], ['Meshullemeth', '2 Kings 21:19', 4], ['Hephzibah', '2 Kings 21:1', 3],
  ['Jecoliah', '2 Kings 15:2', 4], ['Jerusha', '2 Kings 15:33', 4], ['Azubah', '1 Kings 22:42', 4],
  ['Maacah', '1 Kings 15:2', 3], ['Haggith', '2 Samuel 3:4', 4], ['Abital', '2 Samuel 3:4', 4],
  ['Eglah', '2 Samuel 3:5', 4], ['Ahinoam', '1 Samuel 25:43', 4],
];

/** Awaiting a firmer citation before they reach play: the spelling is
 * plausible but the exact NWT verse was not confirmed at authoring time. */
export const draftPeopleRows: SourceRow[] = [
  ['Osnappar', 'Ezra 4:10', 4],
  ['Jehohanan', '2 Chronicles 17:15', 4],
  ['Zebadiah', '1 Chronicles 12:7', 4],
];
