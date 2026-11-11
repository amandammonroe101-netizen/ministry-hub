/* ─────────────────────────────────────────────────────────────
   Women's → Resource Library → per-work enrichment data.

   Keyed by `${authorId}::${workId}` matching SUGGESTED_AUTHORS in
   suggestedAuthors.js. Cover images, ISBNs, page counts, and
   publish dates are sourced from Open Library (and Google Books
   as a fallback) — see WORK_DETAILS below. `chapters` is only
   included where a real, verifiable chapter/letter list exists;
   it's intentionally omitted elsewhere rather than guessed.
   ───────────────────────────────────────────────────────────── */

export function getCoverUrl(detail) {
  if (!detail) return null;
  if (detail.coverId) return `https://covers.openlibrary.org/b/id/${detail.coverId}-L.jpg`;
  if (detail.isbn) return `https://covers.openlibrary.org/b/isbn/${detail.isbn}-L.jpg`;
  return null;
}

export const WORK_DETAILS = {
  'auth_beth_moore::w1': {
    coverId: 527131, isbn: '9780805422948', pages: 256, publishedDate: '1999',
    about: "In Breaking Free, Beth Moore leads readers through a verse-by-verse study of Scripture confronting personal strongholds — fear, insecurity, addiction, and shame. Drawing on her own testimony of finding freedom, she pairs inductive Bible study with reflection questions for individual or small-group use. The study has become one of the most widely used Living Proof Ministries Bible studies since its release.",
  },
  'auth_beth_moore::w2': {
    coverId: 1988612, isbn: '0633096644', pages: 239, publishedDate: '2003',
    about: "Believing God unpacks five statements of faith Beth Moore distills from the lives of Bible figures like Abraham and the Israelites at the Red Sea: God is who He says He is, God can do what He says He can do, I am who God says I am, I can do all things through Christ, and God's Word is alive and active in me. The study challenges readers to move from believing facts about God to actively living out faith in Him.",
  },
  'auth_beth_moore::w3': {
    coverId: 582859, isbn: '9780805423518', pages: 352, publishedDate: '2000',
    about: "Praying God's Word offers a strategic guide to praying Scripture directly over the strongholds that keep believers bound — including fear, despair, and pride. Beth Moore organizes the book around twelve common strongholds, providing corresponding passages of Scripture to pray back to God. It's designed as both a stand-alone resource and a companion to her Breaking Free study.",
  },
  'auth_beth_moore::w4': {
    coverId: 9278335, isbn: '9781496440822', publishedDate: '2020',
    about: "Chasing Vines uses the extended biblical metaphor of the vine and the vinedresser to explore what it means to abide in Christ. Beth Moore examines viticulture imagery from Scripture — pruning, fruitfulness, and the growing seasons of faith — to speak to seasons of flourishing and hardship alike. The book invites readers into a slower, more contemplative study format than her earlier workbook-style studies.",
  },

  'auth_priscilla_shirer::w1': {
    coverId: 1511890, isbn: '9780802450098', pages: 192, publishedDate: '2007',
    about: "Discerning the Voice of God is a Bible study built to help readers recognize when God is speaking amid the noise of daily life. Priscilla Shirer walks through biblical examples of people who heard from God and identifies practical markers for testing and trusting that leading. The study is built for small-group, video-based use through Going Beyond Ministries.",
  },
  'auth_priscilla_shirer::w2': {
    coverId: 10520780, isbn: '1430040270', pages: 192, publishedDate: '2015',
    about: "The Armor of God is a six-session study walking through Ephesians 6:10-18, examining each piece of spiritual armor Paul describes — truth, righteousness, peace, faith, salvation, and the Word of God. Priscilla Shirer frames the Christian life as an active spiritual battle requiring intentional preparation. The study became one of Going Beyond Ministries' most popular releases and was later adapted into the film War Room.",
  },
  'auth_priscilla_shirer::w3': {
    coverId: 7366561, isbn: '9781433688850', pages: 208, publishedDate: '2015',
    about: "Fervent is a guide to strategic prayer, encouraging readers to identify specific areas of spiritual battle in their lives — identity, relationships, habits, and calling — and pray with focused intention against them. Priscilla Shirer combines personal stories with practical prayer strategies for each battlefield. The book pairs with a companion Bible study and prayer journal.",
  },

  'auth_lysa_terkeurst::w1': {
    coverId: 10206837, isbn: '9781400205882', pages: 288, publishedDate: '2016',
    about: "Uninvited explores the sting of rejection — whether from friendships, family, or feeling overlooked — and how to find security in being fully invited and loved by God. Lysa TerKeurst draws on her own experiences of exclusion and betrayal to offer a path toward healing that doesn't require others' approval. The book became a New York Times bestseller for Proverbs 31 Ministries.",
  },
  'auth_lysa_terkeurst::w2': {
    coverId: 8382155, isbn: '9780718039851', publishedDate: '2018',
    about: "It's Not Supposed to Be This Way addresses the disappointment and disillusionment that come when life doesn't unfold as expected. Lysa TerKeurst writes candidly about her own health crisis and marriage struggles during the writing of the book, modeling how to hold onto faith amid unresolved pain. It emphasizes trusting God's character even when circumstances don't make sense.",
  },
  'auth_lysa_terkeurst::w3': {
    coverId: 12562316, isbn: '9781404114890', publishedDate: '2020',
    about: "Forgiving What You Can't Forget tackles forgiveness after deep betrayal, drawing on Lysa TerKeurst's experience of her husband's infidelity and their marriage's near-collapse. She distinguishes forgiveness from reconciliation and trust, offering a process for releasing bitterness without minimizing real harm. The book pairs personal narrative with practical steps toward healing.",
  },
  'auth_lysa_terkeurst::w4': {
    coverId: 10198060, isbn: '9781430053521', pages: 176, publishedDate: '2017',
    about: "Finding I Am is a Bible study walking through the seven 'I Am' statements Jesus makes in the Gospel of John — the bread of life, the good shepherd, the resurrection and the life, and others. Lysa TerKeurst pairs the study with a video series filmed on location in Israel, tracing the historical and geographical context of each statement. It's designed to deepen understanding of who Jesus claimed to be.",
  },

  'auth_jennie_allen::w1': {
    coverId: 9297045, isbn: '1601429649', publishedDate: '2020',
    about: "Get Out of Your Head examines the destructive thought spirals — comparison, self-doubt, victim mentality — that can dominate the mind, and offers a biblical framework for replacing them with truth. Jennie Allen draws on both Scripture and research on the brain's neuroplasticity to argue that thought patterns can be retrained. The book includes practical exercises for identifying and interrupting toxic thinking.",
  },
  'auth_jennie_allen::w2': {
    coverId: 8816254, isbn: '9781524734015', pages: 256, publishedDate: '2017',
    about: "Nothing to Prove challenges the exhausting cycle of striving to measure up, arguing that believers already have everything they need through Christ's power at work in them. Jennie Allen unpacks passages like Ephesians to show how identity in Christ frees people from performance-based living. The book pairs practical vulnerability with a call to rest in grace.",
  },
  'auth_jennie_allen::w3': {
    coverId: 10577226, isbn: '9780849922367', pages: 192, publishedDate: '2014',
    about: "Restless helps readers move past uncertainty about calling by identifying the unique combination of gifts, passions, and experiences God has given them to serve others. Jennie Allen offers a self-discovery framework rather than a one-size-fits-all answer for purpose. The study includes assessments to help readers name their own 'sacred design.'",
  },

  'auth_kay_arthur::w1': {
    coverId: 802518, isbn: '9780736905442', pages: 180, publishedDate: '1994',
    about: "How to Study Your Bible introduces Kay Arthur's signature inductive Bible study method built around three steps: observation, interpretation, and application. Rather than relying on secondhand commentary, the book trains readers to draw truth directly from the biblical text. It has been used for decades as a foundational text for Precept Ministries training.",
  },
  'auth_kay_arthur::w2': {
    coverId: 802540, isbn: '9780736923606', pages: 160, publishedDate: '1995',
    about: "This 28-day devotional walks through the Lord's Prayer phrase by phrase, using it as a template for a deeper, more disciplined prayer life. Kay Arthur pairs each day's reading with short Scripture study and reflection prompts. It's designed as an accessible entry point into her broader inductive study approach.",
  },
  'auth_kay_arthur::w3': {
    coverId: 834951, isbn: '9781578568444', pages: 288, publishedDate: '1999',
    about: "Our Covenant God traces the thread of God's covenant faithfulness across Scripture — from His promises to Abraham through the new covenant in Christ. Kay Arthur shows how understanding covenant reshapes how believers read the entire Bible as one unified story. The book emphasizes the security believers have in a God who keeps His promises.",
  },

  'auth_sarah_young::w1': {
    coverId: 10483494, isbn: '9781400321681', pages: 400, publishedDate: '2004',
    about: "Jesus Calling is a 365-day devotional written in the first person, as if Jesus Himself is speaking words of peace, presence, and reassurance directly to the reader. Sarah Young developed the format from her own practice of listening prayer and journaling during her years as a missionary in Japan and Australia. It became one of the bestselling devotionals of the past two decades, spawning an entire product line.",
  },
  'auth_sarah_young::w2': {
    coverId: 7440338, isbn: '0718039505', publishedDate: '2016',
    about: "Jesus Always is a devotional companion to Jesus Calling, shifting focus specifically toward the hope and assurance found in the gospel and Christ's finished work. Sarah Young continues the first-person voice of Jesus speaking directly to the reader, paired with supporting Scripture for each entry. It was written in part after a health condition limited her ability to write extensively.",
  },
  'auth_sarah_young::w3': {
    coverId: 7398817, isbn: '9780718034696', publishedDate: '2015',
    about: "Jesus Today focuses on finding hope and confidence amid daily struggles and uncertainty, continuing Sarah Young's first-person devotional format. Each entry pairs a short reflection with accompanying Bible verses meant to be read alongside the text. It was written as a message of encouragement for readers facing difficult seasons.",
  },

  'auth_ann_voskamp::w1': {
    coverId: 6679895, isbn: '9780310321910', publishedDate: '2010',
    about: "One Thousand Gifts chronicles Ann Voskamp's personal challenge to record one thousand specific things she's grateful for, and how the practice of naming gifts transformed her capacity to experience joy amid grief and daily monotony. Written after the loss of a sibling in childhood, the book weaves memoir with a theology of gratitude as a spiritual discipline. It became a bestseller and helped spark the broader gratitude-journal movement in Christian publishing.",
  },
  'auth_ann_voskamp::w2': {
    coverId: 9138557, isbn: '1531832180', pages: 256, publishedDate: '2016',
    about: "The Broken Way explores how embracing brokenness — rather than avoiding or hiding from it — can lead to a fuller, more whole life with God. Ann Voskamp writes through her own experiences of trauma and loss, arguing that grace often meets people precisely at their point of fracture. The book continues her reflective, lyrical prose style from One Thousand Gifts.",
  },
  'auth_ann_voskamp::w3': {
    coverId: 13873242, isbn: '0310090776', pages: 144, publishedDate: '2022',
    about: "WayMaker addresses seasons of waiting and uncertainty, offering encouragement for finding God's presence and provision when circumstances seem stalled or hopeless. Ann Voskamp draws on both Scripture and her own experiences of prolonged hardship. The accompanying study guide is designed for small-group discussion.",
  },

  'auth_joanna_weaver::w1': {
    coverId: 834992, isbn: '0739411519', pages: 272, publishedDate: '2000',
    about: "Drawing on the story of Mary and Martha in Luke 10, this book explores the tension between the busyness of serving and the stillness of sitting at Jesus's feet. Joanna Weaver encourages readers to cultivate intimacy with God, not just activity for God. It has remained a staple women's ministry title for over two decades.",
  },
  'auth_joanna_weaver::w2': {
    coverId: 746734, isbn: '1400072476', pages: 288, publishedDate: '2006',
    about: "A companion to Having a Mary Heart in a Martha World, this book focuses on the inner transformation needed to let go of old habits and patterns that keep believers from spiritual growth. Joanna Weaver examines the process of surrendering control and allowing God to reshape character from the inside out. It's built as both further teaching and a practical workbook.",
  },

  'auth_christine_caine::w1': {
    coverId: 8841694, isbn: '0310351367', pages: 210, publishedDate: '2014',
    about: "Unstoppable traces God's redemptive plan across the whole of Scripture, from Genesis to Revelation, and calls readers to see their own lives as part of that unfolding story. Christine Caine draws on her work fighting human trafficking through the A21 Campaign to illustrate living out that calling practically. The book emphasizes purpose grounded in the larger biblical narrative rather than individual circumstance.",
  },
  'auth_christine_caine::w2': {
    coverId: 8227166, isbn: '9780310340720', pages: 224, publishedDate: '2016',
    about: "Unashamed addresses the shame and insecurity that can quietly undermine a believer's confidence and calling. Christine Caine writes from her own story of childhood trauma and abuse, showing how identity rooted in Christ can replace shame with boldness. The book pushes back against comparison culture and perfectionism within Christian communities.",
  },
  'auth_christine_caine::w3': {
    coverId: 7352823, isbn: '9780310333876', pages: 240, publishedDate: '2012',
    about: "Undaunted is a study on facing fear, adversity, and setbacks with God-given courage, drawing heavily on Christine Caine's own life story of trauma, doubt, and eventually founding the anti-trafficking organization A21. It challenges readers to move past their own excuses and wounds into active purpose. The accompanying video series is widely used in small groups.",
  },

  'auth_jen_wilkin::w1': {
    coverId: 7414819, isbn: '9781433541766', pages: 160, publishedDate: '2014',
    about: "Women of the Word makes the case for studying the Bible in context — understanding its historical setting, literary genre, and overall storyline — rather than pulling isolated verses for personal application. Jen Wilkin lays out tools of skilled Bible reading intended to build long-term biblical literacy. It has become a foundational text for many church women's ministries seeking a more rigorous approach to Scripture.",
  },
  'auth_jen_wilkin::w2': {
    coverId: 7423458, isbn: '1433549832', publishedDate: '2016',
    about: "None Like Him examines ten attributes of God that are His alone — such as being infinite, immutable, and omniscient — and contrasts them with human limitation. Jen Wilkin argues that a right understanding of God's incomparable nature is the foundation for genuine worship and humility. Each chapter pairs theological explanation with practical application for daily faith.",
  },
  'auth_jen_wilkin::w3': {
    coverId: 8166970, isbn: '9781433549878', pages: 176, publishedDate: '2018',
    about: "In His Image explores ten ways Scripture calls believers to reflect God's character — including holiness, love, justice, and truth — as those made in His image. Jen Wilkin pairs each attribute with practical application for how it should shape everyday conduct and relationships. It serves as a companion volume to her earlier book None Like Him, which focuses on God's incommunicable attributes.",
  },

  'auth_david_jeremiah::w1': {
    coverId: 6793888, isbn: '9780849921193', pages: 216, publishedDate: '2006',
    about: "Captured by Grace examines the undeserved, transforming grace of God through the biblical account of the apostle Paul's conversion alongside stories of modern-day radical grace encounters. David Jeremiah argues that grace isn't simply a doctrine to understand but an experience meant to reshape identity and behavior. The book pairs theology with real-life testimonies.",
  },
  'auth_david_jeremiah::w2': {
    coverId: 6665963, isbn: '9780446565943', pages: 293, publishedDate: '2010',
    about: "Written in the wake of the 2008 financial crisis, this book examines biblical prophecy concerning the global economy, debt, and end-times financial upheaval. David Jeremiah connects contemporary economic anxiety to scriptural warnings about a coming period of turmoil before Christ's return. The book combines cultural and economic analysis with a call to spiritual preparedness rather than panic.",
  },
  'auth_david_jeremiah::w3': {
    coverId: 2626378, isbn: '9780785228097', pages: 258, publishedDate: '2007',
    about: "Signs of Life outlines the marks of authentic, growing faith, contrasting genuine spiritual vitality with mere religious routine. David Jeremiah draws on Scripture to describe what a life transformed by the gospel should look like in practice. The book is structured around clear, practical signs readers can use for self-examination.",
  },
  'auth_david_jeremiah::w4': {
    coverId: 6742083, isbn: '078522887X', pages: 257, publishedDate: '2008',
    about: "What in the World Is Going On? identifies ten prophetic signs David Jeremiah sees converging in contemporary geopolitics, culture, and technology, and connects them to biblical end-times prophecy. The book was written to help readers process world events without fear by anchoring them in a scriptural framework. It became one of his bestselling prophecy titles.",
  },
  'auth_david_jeremiah::w5': {
    coverId: 6378078, isbn: '9780849919626', publishedDate: '2009',
    about: "This book addresses how believers can maintain spiritual assurance and stability amid a rapidly changing, often unsettling world. David Jeremiah draws on biblical examples of people who remained faithful during uncertain times. It emphasizes anchoring identity and hope in unchanging scriptural truth rather than shifting circumstances.",
  },
  'auth_david_jeremiah::w6': {
    coverId: 7386855, isbn: '9781455507344', publishedDate: '2011',
    about: "I Never Thought I'd See the Day! surveys major cultural shifts in areas like family, morality, and faith, examining them through the lens of biblical prophecy and discernment. David Jeremiah argues these changes shouldn't surprise believers who understand what Scripture says about the last days. The book balances cultural commentary with a call to steady faith.",
  },
  'auth_david_jeremiah::w7': {
    coverId: 10727746, isbn: '9781414380490', pages: 283, publishedDate: '2014',
    about: "Agents of the Apocalypse examines the key figures and forces described in the book of Revelation — including the four horsemen and other apocalyptic imagery — and what they reveal about the end of the age. David Jeremiah walks through Revelation's prophetic sequence in accessible, narrative-driven chapters. The book is part of his broader body of work on biblical prophecy.",
  },
  'auth_david_jeremiah::w8': {
    coverId: 8139826, isbn: '9781414380537', pages: 384, publishedDate: '2015',
    about: "Agents of Babylon explores the prophetic visions in the book of Daniel and what they reveal about world empires, end-times events, and God's sovereignty over history. David Jeremiah connects ancient Babylon to contemporary geopolitical and spiritual themes. It serves as a companion to his earlier prophecy-focused works.",
  },
  'auth_david_jeremiah::w9': {
    coverId: 11971673, isbn: '1467619655', publishedDate: '2015',
    about: "A.D. The Revolution That Changed the World traces the earliest days of the Christian church following Christ's resurrection and ascension, examining how a small group of believers transformed the ancient world. The book was released alongside an NBC television miniseries of the same name. David Jeremiah highlights the courage and conviction of the early apostles as a model for believers today.",
  },
  'auth_david_jeremiah::w10': {
    coverId: 8753729, isbn: '9780785229544', publishedDate: '2019',
    about: "The Book of Signs examines biblical signs and markers throughout Scripture that point toward Christ's return, drawing especially on Old and New Testament prophecy. David Jeremiah organizes the signs into categories — geopolitical, cultural, and spiritual — to help readers understand where current events fit in the prophetic timeline. It's framed as a call to watchfulness rather than fear.",
  },
  'auth_david_jeremiah::w11': {
    isbn: '9780718079857', pages: 240, publishedDate: '2018',
    about: "Overcomer outlines eight strategies for living with unstoppable strength and unshakable faith, drawn from the book of Ephesians and other New Testament passages on spiritual armor and identity in Christ. David Jeremiah frames the Christian life as one of active, confident overcoming rather than passive struggle. The book pairs practical application with in-depth Scripture study.",
  },
  'auth_david_jeremiah::w12': {
    pages: 260, publishedDate: '2020',
    about: "The Jesus You May Not Know explores lesser-examined facets of Christ's identity and ministry beyond the familiar Sunday-school portrait, drawing on the full range of Gospel accounts. David Jeremiah highlights aspects of Jesus's character — including His authority, compassion, and humanity — that are easy to overlook in more familiar retellings. The book aims to deepen readers' personal relationship with Christ through a fuller picture of who He is.",
  },
  'auth_david_jeremiah::w13': {
    isbn: '9781414380476', pages: 224, publishedDate: '2020',
    about: "Hope: Living Fearlessly in a Scary World addresses the anxiety and uncertainty of modern life through a biblical theology of hope grounded in God's promises. David Jeremiah examines Scripture's teaching on fear and offers practical steps for replacing worry with confident trust. The book was written amid a season of heightened cultural anxiety.",
  },
  'auth_david_jeremiah::w14': {
    coverId: 12788795, isbn: '9780785224198', pages: 240, publishedDate: '2021',
    about: "Where Do We Go From Here? examines how believers should respond to a rapidly shifting cultural and moral landscape, offering a biblical framework for navigating uncertainty about the future. David Jeremiah addresses contemporary social and political change through the lens of scriptural prophecy and wisdom. The book calls for engaged hope rather than withdrawal or despair.",
  },
  'auth_david_jeremiah::w15': {
    coverId: 14596682, isbn: '0785251995', publishedDate: '2022',
    about: "The World of the End offers a contemporary survey of end-times biblical prophecy, examining how current global events may relate to the sequence of events described in Scripture. David Jeremiah revisits core prophetic themes from his earlier books with updated cultural context. The book is aimed at helping readers watch current events through a discerning, hope-filled lens.",
  },

  'auth_c_s_lewis::w1': {
    coverId: 8441376, isbn: '9788804436775', pages: 186, publishedDate: '1950',
    chapters: ['Lucy Looks into a Wardrobe', 'What Lucy Found There', 'Edmund and the Wardrobe', 'Turkish Delight', 'Back on This Side of the Door', 'Into the Forest', 'A Day with the Beavers', 'What Happened After Dinner', "In the Witch's House", 'The Spell Begins to Break', 'Aslan Is Nearer', "Peter's First Battle", 'Deep Magic from the Dawn of Time', 'The Triumph of the Witch', 'Deeper Magic from Before the Dawn of Time', 'What Happened About the Statues', 'The Hunting of the White Stag'],
    about: "The first published entry in the Chronicles of Narnia (though second chronologically), this novel follows four English siblings — Peter, Susan, Edmund, and Lucy — who discover the magical land of Narnia through an old wardrobe. They encounter the noble lion Aslan and the tyrannical White Witch, whose eternal winter has held Narnia in an icy grip. The story is widely read as a Christian allegory of sacrifice and resurrection.",
  },
  'auth_c_s_lewis::w2': {
    coverId: 9779, isbn: '0006265278', pages: 160, publishedDate: '1942',
    chapters: Array.from({ length: 31 }, (_, i) => `Letter ${i + 1}`),
    about: "The Screwtape Letters is a satirical epistolary novel composed of correspondence from a senior demon, Screwtape, to his nephew and trainee tempter, Wormwood, offering advice on how to secure the damnation of an ordinary human referred to only as 'the Patient.' Through this inverted perspective, C.S. Lewis explores temptation, pride, and everyday spiritual warfare with dark humor. It remains one of his most popular and frequently quoted works.",
  },
  'auth_c_s_lewis::w3': {
    isbn: '9780060652951', pages: 146, publishedDate: '1945',
    about: "The Great Divorce follows a nameless narrator who takes a fantastical bus ride from a gray, dreary town (implied to be hell or purgatory) to the foothills of heaven. There, ghostly visitors encounter solid, radiant beings who urge them to let go of the sins and grievances they still cling to. C.S. Lewis uses the journey as an extended meditation on free will, self-deception, and the choice between joy and self-absorption.",
  },
  'auth_c_s_lewis::w4': {
    coverId: 9321665, isbn: '8385541780', pages: 174, publishedDate: '1938',
    about: "The first novel in Lewis's Space Trilogy follows philologist Elwin Ransom, who is kidnapped and taken to Mars (called Malacandra by its inhabitants). There he discovers a world untouched by the moral Fall that afflicts Earth — known among the planets as 'the silent planet.' The novel blends science fiction adventure with theological reflection on sin, hierarchy, and cosmic order.",
  },
  'auth_c_s_lewis::w5': {
    coverId: 9186044, isbn: '0025708457', pages: 223, publishedDate: '1943',
    about: "The second Space Trilogy novel sends Ransom to Venus (Perelandra), a paradise world in its own innocent, unfallen state. There he must confront a corrupting force attempting to tempt Perelandra's version of Eve into repeating humanity's original sin. The novel is a philosophical exploration of temptation and the fragility of innocence.",
  },
  'auth_c_s_lewis::w6': {
    coverId: 9184539, isbn: '9780002158145', pages: 320, publishedDate: '1956',
    about: "Till We Have Faces retells the myth of Cupid and Psyche from the perspective of Psyche's bitter, disfigured older sister Orual, who believes she has been wronged by the gods. Lewis considered it his most mature and personal work of fiction. The novel explores jealousy, self-deception, and the difficulty of truly knowing oneself before one can know the divine.",
  },
  'auth_c_s_lewis::w7': {
    coverId: 45897, isbn: '0007241364', pages: 216, publishedDate: '1951',
    about: "In the second published Chronicle of Narnia, the four Pevensie children return to Narnia to find that centuries have passed and the land has fallen under the oppressive rule of the Telmarines. They join forces with the rightful heir, Prince Caspian, to restore Old Narnia and its true king. The novel continues the series' themes of faith, courage, and rightful rule.",
  },
  'auth_c_s_lewis::w8': {
    coverId: 6538891, isbn: '9780061947421', pages: 191, publishedDate: '1943',
    about: "Mere Christianity compiles a series of BBC radio talks Lewis gave during World War II, laying out a reasoned case for the Christian faith accessible to believers and skeptics alike. He deliberately avoids denominational specifics, focusing instead on the core, shared tenets of Christian belief. It remains one of the most influential works of popular Christian apologetics of the 20th century.",
  },
  'auth_c_s_lewis::w9': {
    coverId: 9184545, isbn: '0006211712', pages: 238, publishedDate: '1955',
    about: "Surprised by Joy is C.S. Lewis's spiritual autobiography, tracing his intellectual and emotional journey from childhood loss through atheism and finally to Christian conversion. He gives particular attention to fleeting moments of transcendent 'joy' that recurred throughout his life and eventually pointed him toward faith. The book combines memoir with philosophical reflection on longing and meaning.",
  },
  'auth_c_s_lewis::w10': {
    coverId: 6554012, isbn: '9788936506964', pages: 148, publishedDate: '1940',
    about: "The Problem of Pain tackles one of the central objections to Christian faith: how a good and all-powerful God can allow suffering. Lewis examines human and animal pain, free will, and the nature of goodness, arguing that suffering is compatible with — and even purposeful within — a loving God's design. The book remains a foundational text in Christian theodicy.",
  },
  'auth_c_s_lewis::w11': {
    coverId: 6379595, isbn: '0020662300', pages: 117, publishedDate: '1943',
    about: "The Abolition of Man is a short philosophical work defending the existence of objective moral values — what Lewis calls the 'Tao' — against the rising tide of moral relativism in education and culture. He warns that stripping away objective values ultimately dehumanizes rather than liberates people. Though brief, it's considered one of Lewis's most rigorous and influential nonfiction works.",
  },
  'auth_c_s_lewis::w12': {
    coverId: 9321678, isbn: '0802724701', pages: 64, publishedDate: '1961',
    about: "Written after the death of his wife, Joy Davidman, A Grief Observed is a raw, unfiltered journal of Lewis's own grief, doubt, and anger toward God in the aftermath of loss. Originally published under a pseudonym, it stands in stark contrast to the confident tone of his earlier apologetics. The book has become a widely read companion for those walking through grief.",
  },
  'auth_c_s_lewis::w13': {
    coverId: 9321672, isbn: '9561106492', pages: 160, publishedDate: '1960',
    about: "The Four Loves examines four types of love identified in classical thought — affection, friendship, eros, and charity — and how each reflects and falls short of divine love. Lewis draws on literature, philosophy, and personal experience to explore both the beauty and the potential distortions within each kind of love. It remains one of his most widely read nonfiction works.",
  },
  'auth_c_s_lewis::w14': {
    isbn: '015676248X', pages: 170, publishedDate: '1958',
    about: "Reflections on the Psalms is a personal, informal meditation on the biblical book of Psalms, written not as scholarly commentary but as one ordinary reader's reflections. Lewis explores themes like praise, judgment, and the psalmists' raw honesty with God, including difficult passages of anger and cursing. The book is valued for making the Psalms feel immediate and human rather than distant Scripture.",
  },
  'auth_c_s_lewis::w15': {
    coverId: 9321714, isbn: '9781107604728', pages: 142, publishedDate: '1961',
    about: "An Experiment in Criticism proposes an unconventional approach to literary criticism: judging books not by their apparent quality but by how they're read, arguing that 'good' reading is attentive, receptive, and self-forgetful. Lewis suggests that literature's value lies in expanding a reader's experience beyond their own limited perspective. The book remains influential in literary theory and reading pedagogy.",
  },

  'auth_max_lucado::w1': {
    coverId: 841929, isbn: '9781581344059', pages: 32, publishedDate: '1997',
    about: "You Are Special tells the story of Punchinello, a wooden Wemmick who is covered in dot stickers by his fellow villagers for his flaws and mistakes. Through a visit with his maker, Eli, Punchinello learns that his worth doesn't depend on others' opinions but on how his maker sees him. The story is Max Lucado's most popular children's book and the launch of the Wemmicksville series.",
  },
  'auth_max_lucado::w2': {
    coverId: 9130185, isbn: '9780718074210', pages: 242, publishedDate: '2017',
    about: "Anxious for Nothing draws on Philippians 4:6-7 to offer a biblical framework for managing worry and anxiety in daily life. Max Lucado combines Scripture, personal story, and practical strategy to help readers replace chronic worry with God's peace. The book was later adapted into a study specifically addressing anxiety in teenagers as well.",
  },
  'auth_max_lucado::w3': {
    coverId: 645738, isbn: '0849999715', pages: 240, publishedDate: '1991',
    about: "He Chose the Nails examines the meaning behind the specific elements of Christ's crucifixion — the crown of thorns, the nails, the empty tomb — and what each reveals about the nature of God's love. Max Lucado walks through the details of the Passion narrative to draw out their theological significance. The book is often used for reflection during the Easter season.",
  },
  'auth_max_lucado::w4': {
    coverId: 6805994, isbn: '9781404106727', pages: 240, publishedDate: '2006',
    about: "Facing Your Giants retells the story of David — from his anointing as a shepherd boy through his battle with Goliath and his complicated reign as king — drawing lessons for facing modern-day giants like fear, failure, and temptation. Max Lucado uses David's imperfect but faith-filled life as a model for facing overwhelming challenges. The book blends narrative retelling with practical application.",
  },
  'auth_max_lucado::w5': {
    coverId: 645572, isbn: '0849912970', pages: 240, publishedDate: '2001',
    about: "Traveling Light uses Psalm 23 as a framework for releasing the burdens people were never meant to carry — including worry, guilt, and grief. Max Lucado walks through each line of the psalm, connecting the shepherd imagery to modern anxieties. The book encourages readers toward a lighter, more trusting way of living.",
  },
  'auth_max_lucado::w6': {
    coverId: 6715377, isbn: '0849921392', publishedDate: '2009',
    about: "Fearless invites readers to imagine a life unencumbered by the various fears that quietly shape decisions — fear of not mattering, fear of disappointing God, fear of running out. Max Lucado examines Scripture's repeated command to 'fear not' and what it looks like to actually live that out. The book pairs personal anecdote with biblical exposition.",
  },
  'auth_max_lucado::w7': {
    coverId: 645488, isbn: '9780613067133', pages: 248, publishedDate: '1996',
    about: "In the Grip of Grace explores the security of a love that cannot be earned or lost, drawing primarily on Paul's letter to the Romans. Max Lucado contrasts a performance-based faith with the freedom of resting in God's unconditional grace. The book addresses common misunderstandings about grace and legalism within Christian life.",
  },
  'auth_max_lucado::w8': {
    coverId: 645543, isbn: '9780849917851', pages: 223, publishedDate: '1998',
    about: "Just Like Jesus examines the character qualities of Christ — compassion, forgiveness, humility — and how believers can gradually grow to reflect them. Max Lucado frames spiritual growth as a lifelong process of the heart being reshaped rather than an instant transformation. The book combines short reflections with practical application for daily character growth.",
  },
  'auth_max_lucado::w9': {
    coverId: 645481, isbn: '0849910994', pages: 243, publishedDate: '1994',
    about: "When God Whispers Your Name emphasizes God's personal, individualized attention to each person, countering the feeling of being anonymous or overlooked. Max Lucado uses the biblical image of the Good Shepherd, who calls his sheep by name, to illustrate this intimate care. The book is composed of short, reflective chapters suited to daily devotional reading.",
  },
  'auth_max_lucado::w10': {
    isbn: '9781400233038', pages: 240, publishedDate: '2016',
    about: "3:16: The Numbers of Hope offers an extended meditation on John 3:16, breaking the single verse into its component phrases — 'For God so loved the world,' 'that He gave His only Son' — for line-by-line reflection. Max Lucado argues this one verse contains the essence of the entire gospel message. The book was originally released in 2007 and later reissued in an updated edition.",
  },
  'auth_max_lucado::w11': {
    coverId: 645463, isbn: '1400323290', pages: 32, publishedDate: '1994',
    about: "The Crippled Lamb tells the story of Joshua, a lamb who cannot run or jump like the other sheep and fears he'll never be of any use. On the night of Christ's birth, Joshua discovers his unique place is exactly where he's needed most — keeping the newborn Jesus warm in the stable. The story is a Christmas-themed children's book about purpose amid limitation.",
  },
  'auth_max_lucado::w12': {
    coverId: 646995, isbn: '9780849957642', pages: 408, publishedDate: '2000',
    about: "Grace for the Moment compiles a year's worth of short daily devotional readings drawn from across Max Lucado's body of work, each centered on God's grace. Entries are organized by date rather than theme, making it suited for a slow, daily reading rhythm. The book has spawned multiple companion volumes, including editions for men, teens, and journaling.",
  },
  'auth_max_lucado::w13': {
    coverId: 645422, isbn: '0802727573', pages: 230, publishedDate: '1993',
    about: "He Still Moves Stones examines several of Jesus's miracles and healing encounters in the Gospels, framing them as evidence that God remains active and willing to intervene in seemingly impossible situations today. Max Lucado draws parallels between the biblical accounts and modern struggles that can feel insurmountable. The book emphasizes hope grounded in God's demonstrated character.",
  },
  'auth_max_lucado::w14': {
    coverId: 842093, isbn: '1581344686', pages: 31, publishedDate: '2001',
    about: "A follow-up to You Are Special, this Wemmicksville story follows Punchinello as he faces new self-doubt and learns again to find his identity and belonging in his maker's love rather than others' opinions. The story reinforces the series' central theme of unconditional worth. It's aimed at young children but is often used for family discussion.",
  },
  'auth_max_lucado::w15': {
    coverId: 874749, isbn: '1598591649', pages: 208, publishedDate: '2006',
    about: "The Christmas Candle tells the story of a small English village and a candlemaker's shop where a mysterious 'Christmas Candle,' lit once every twenty-five years, is said to grant a miracle to whoever receives it. Max Lucado weaves several intertwined character stories around faith, doubt, and hope during a difficult holiday season. The novella was adapted into a feature film in 2013.",
  },

  'auth_levi_lusko::w1': {
    coverId: 7381107, isbn: '9780718032234', pages: 240, publishedDate: '2015',
    about: "Through the Eyes of a Lion is Levi Lusko's account of his family's grief following the sudden death of his five-year-old daughter, Lenya, and how that loss reshaped his faith. He writes candidly about wrestling with God's goodness in the face of devastating loss while ultimately choosing to see difficulty through the lens of God's larger story. The book became a foundational text for his ministry's focus on grief and hope.",
  },
  'auth_levi_lusko::w2': {
    coverId: 8839552, isbn: '0785220860', pages: 288, publishedDate: '2018',
    about: "I Declare War addresses the internal battles believers face — habits, addictions, insecurities — and frames overcoming them as an active spiritual war rather than a passive hope for change. Levi Lusko outlines practical strategies for identifying and confronting these strongholds. The book emphasizes disciplined, intentional living as an act of spiritual warfare.",
  },
  'auth_levi_lusko::w3': {
    coverId: 14316565, isbn: '0718032152', pages: 238, publishedDate: '2017',
    about: "Swipe Right examines the spiritual and relational significance of sex, dating, and romance in a culture shaped by dating apps and casual hookup norms. Levi Lusko argues for a biblical vision of romance and physical intimacy grounded in commitment and covenant. The book blends cultural commentary with pastoral guidance for singles and couples.",
  },
  'auth_levi_lusko::w4': {
    isbn: '1400345588', pages: 304, publishedDate: '2025',
    about: "Blessed Are the Spiraling addresses the disorienting seasons of doubt, anxiety, and unraveling that many believers experience but rarely discuss openly. Levi Lusko reframes these 'spiraling' moments not as failures of faith but as places where God meets people honestly. The book pairs personal vulnerability with practical steps toward stability.",
  },
  'auth_levi_lusko::w5': {
    coverId: 11315569, isbn: '078525286X', pages: 352, publishedDate: '2022',
    about: "The Last Supper on the Moon takes its title from astronaut Buzz Aldrin's little-known communion service on the lunar surface during the Apollo 11 mission, using it as a launching point for reflections on faith, wonder, and human purpose. Levi Lusko connects this historical moment to broader questions about meaning and transcendence. The book blends storytelling with spiritual reflection.",
  },
  'auth_levi_lusko::w6': {
    coverId: 11248999, isbn: '078523277X', pages: 320, publishedDate: '2020',
    about: "Take Back Your Life is a 40-day guided journey designed to help readers realign their daily habits and beliefs with intentional, purposeful living. Levi Lusko challenges readers to identify areas where drift has set in and take deliberate action to reclaim them. The book combines daily readings with practical challenges.",
  },
  'auth_levi_lusko::w7': {
    isbn: '1400224330', pages: 192, publishedDate: '2021',
    about: "Roar Like a Lion offers ninety short devotional meditations aimed at building courageous, resilient faith in the face of fear and adversity. Levi Lusko draws on the biblical image of lion-like boldness throughout Scripture. Each entry pairs a short reflection with a related Scripture passage.",
  },
  'auth_levi_lusko::w8': {
    coverId: 14774811, isbn: '0785291385', publishedDate: '2022',
    about: "The Marriage Devotional is a 52-week devotional co-written for couples, pairing Scripture and reflection prompts intended to strengthen a marriage's spiritual foundation. Levi Lusko draws on his own marriage for practical, honest illustrations. Each week's entry is designed to be read and discussed together.",
  },
  'auth_levi_lusko::w9': {
    coverId: 14735415, isbn: '9781400242672', publishedDate: '2023',
    about: "Marvel at the Moon offers ninety short devotions connecting the wonder of the night sky and cosmic scale to reflections on God's presence and majesty. Levi Lusko uses astronomy and space exploration as a recurring image for awe and perspective. The devotional follows a similar format to his earlier Roar Like a Lion.",
  },
  'auth_levi_lusko::w10': {
    isbn: '9781400253265', publishedDate: '2025',
    about: "Don't Worry, Warrior! offers ten practical, Scripture-based strategies for confronting anxiety and worry in daily life. Levi Lusko frames overcoming anxiety as an active spiritual discipline rather than simply willing oneself to feel better. The book continues his focus on real, vulnerable engagement with mental and emotional struggle.",
  },

  'auth_joyce_meyer::w1': {
    coverId: 288414, isbn: '1577945026', pages: 288, publishedDate: '1995',
    about: "Battlefield of the Mind is Joyce Meyer's best-known book, addressing how negative, defeating thought patterns take root and how to replace them with truth-based thinking. She draws on Romans 12:2's call to renew the mind, arguing that lasting life change starts with what happens in a person's thoughts. The book has sold millions of copies and launched an entire 'Battlefield' series.",
  },
  'auth_joyce_meyer::w2': {
    coverId: 690911, isbn: '0446691070', pages: 279, publishedDate: '1996',
    about: "Me and My Big Mouth! examines the power of spoken words to shape circumstances, relationships, and self-perception, drawing on biblical teaching about the tongue from James and Proverbs. Joyce Meyer encourages readers to become intentional about speaking faith and life rather than complaint and negativity. The book combines personal anecdotes with Scripture-based teaching.",
  },
  'auth_joyce_meyer::w3': {
    isbn: '9780759568372', pages: 272, publishedDate: '2006',
    about: "The Confident Woman encourages women to live boldly, free from the fear of failure or others' opinions, by grounding their confidence in their identity in Christ. Joyce Meyer draws on her own history overcoming abuse and insecurity to model this kind of bold living. The book addresses common insecurities specific to women's experience, from appearance to relationships to calling.",
  },
  'auth_joyce_meyer::w4': {
    coverId: 12947398, isbn: '1444750011', pages: 384, publishedDate: '2013',
    about: "Power Thoughts outlines twelve specific thought patterns Joyce Meyer identifies as key to winning the ongoing battle of the mind, such as 'I am forgiven' and 'I trust God.' Each is paired with supporting Scripture and practical application for replacing default negative thinking. The book expands on themes first introduced in Battlefield of the Mind.",
  },
  'auth_joyce_meyer::w5': {
    coverId: 1235121, isbn: '9781577944744', pages: 256, publishedDate: '2002',
    about: "Approval Addiction addresses the compulsive need to please others and gain approval, which Joyce Meyer argues can quietly control decisions and self-worth. She traces this pattern to root causes like childhood wounds and offers a path toward finding approval from God instead. The book combines personal testimony with practical steps for breaking the cycle.",
  },
  'auth_joyce_meyer::w6': {
    coverId: 6906047, isbn: '1546035214', pages: 170, publishedDate: '2002',
    about: "Beauty for Ashes addresses emotional healing after deep hurt, drawing its title from Isaiah 61's promise that God exchanges ashes for beauty. Joyce Meyer writes from her own history of childhood abuse to offer a path toward genuine recovery rather than simply masking pain. The book emphasizes that healing is a process requiring both God's grace and intentional effort.",
  },
  'auth_joyce_meyer::w7': {
    coverId: 9520436, isbn: '1455507296', pages: 284, publishedDate: '2011',
    about: "Living Beyond Your Feelings examines how unmanaged emotions can drive poor decisions and damaged relationships, and offers a biblical framework for responding to feelings without being controlled by them. Joyce Meyer distinguishes between acknowledging emotions honestly and letting them dictate behavior. The book includes practical strategies for emotional regulation grounded in Scripture.",
  },
  'auth_joyce_meyer::w8': {
    coverId: 1235116, isbn: '0446196258', pages: 272, publishedDate: '2007',
    about: "The Penny is a work of fiction — a departure from Joyce Meyer's typical nonfiction teaching style — that follows a young girl during the Great Depression who discovers life lessons through a simple found penny. The story explores themes of gratitude, resilience, and unexpected grace amid hardship. It was co-written with author Deborah Bedford.",
  },
  'auth_joyce_meyer::w9': {
    coverId: 12883219, isbn: '1444745956', pages: 448, publishedDate: '2012',
    about: "Trusting God Day by Day is a year-long daily devotional aimed at building steady faith and trust through short daily readings and accompanying Scripture. Joyce Meyer draws on themes from across her broader teaching ministry, distilled into brief daily entries. The devotional is designed for a consistent, cumulative reading rhythm across a full year.",
  },
  'auth_joyce_meyer::w10': {
    coverId: 10424180, isbn: '1455517224', pages: 320, publishedDate: '2012',
    about: "Change Your Words, Change Your Life examines how the language people habitually use shapes their outlook, relationships, and outcomes. Joyce Meyer draws on biblical teaching about the power of the tongue to argue that changing speech patterns can be a catalyst for broader life change. The book offers practical strategies for identifying and shifting negative speech habits.",
  },
  'auth_joyce_meyer::w11': {
    coverId: 11302644, isbn: '1455560251', publishedDate: '2019',
    about: "Healing the Soul of a Woman addresses emotional wounds particular to women's experiences — including trauma, insecurity, and relational hurt — and offers a path toward wholeness grounded in God's love. Joyce Meyer draws on her own recovery from childhood abuse throughout the book. It combines personal testimony with practical steps for emotional healing.",
  },
  'auth_joyce_meyer::w12': {
    coverId: 10580731, isbn: '1546026320', pages: 288, publishedDate: '2020',
    about: "Do It Afraid encourages readers to take courageous action despite fear, arguing that waiting for fear to disappear before acting often means never acting at all. Joyce Meyer draws on her own experience stepping into public ministry despite significant personal insecurity. The book offers practical encouragement for pursuing calling in spite of fear.",
  },
  'auth_joyce_meyer::w13': {
    coverId: 286433, isbn: '0786260440', pages: 345, publishedDate: '2003',
    about: "How to Hear from God offers practical guidance on recognizing God's leading through Scripture, prayer, circumstances, and inner conviction. Joyce Meyer addresses common questions and confusion around discerning God's voice amid competing thoughts and emotions. The book emphasizes cultivating a consistent, attentive relationship with God as the foundation for spiritual discernment.",
  },
  'auth_joyce_meyer::w14': {
    coverId: 6669395, isbn: '9781546010586', pages: 432, publishedDate: '2010',
    about: "The Confident Woman Devotional pairs daily short readings with Scripture to reinforce living boldly and free from fear of failure or others' opinions. It serves as a devotional companion to Joyce Meyer's book The Confident Woman, distilling its themes into a year of daily entries. Each day's reading closes with a related Scripture verse and brief prayer prompt.",
  },
  'auth_joyce_meyer::w15': {
    coverId: 286436, isbn: '9780759510272', pages: 376, publishedDate: '2003',
    about: "Starting Your Day Right offers a devotional reading for each morning of the year, designed to set a tone of faith and positivity before the day's demands take over. Joyce Meyer draws each entry from her broader teaching on renewing the mind and daily trust in God. The short format is intended for a quick but meaningful start to each day.",
  },

  /* ── Commentary authors — cover/ISBN/page/date data sourced from Open
     Library. Matthew Henry's 15 individual "Commentary on X" entries all
     point to the single real Hendrickson 1991 unabridged one-volume
     edition, which genuinely contains every book listed. ── */

  // auth_matthew_henry
  'auth_matthew_henry::w1': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w2': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w3': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w4': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w5': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w6': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w7': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w8': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w9': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w10': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w11': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w12': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w13': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w14': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },
  'auth_matthew_henry::w15': { coverId: 720111, isbn: '9780943575322', pages: 2485, publishedDate: '1991' },

  // auth_warren_wiersbe
  'auth_warren_wiersbe::w1': { coverId: 12403502, isbn: '1434766357', pages: 190, publishedDate: '2010' },
  'auth_warren_wiersbe::w2': { coverId: 800896, isbn: '156476592X', pages: 208, publishedDate: '1997' },
  'auth_warren_wiersbe::w3': { coverId: 800919, isbn: '9781564767028', pages: 211, publishedDate: '1998' },
  'auth_warren_wiersbe::w4': { coverId: 696149, isbn: '1434766152', pages: 192, publishedDate: '1992' },
  'auth_warren_wiersbe::w5': { coverId: 532761, isbn: '0781433053', pages: 180, publishedDate: '2000' },
  'auth_warren_wiersbe::w6': { coverId: 800853, isbn: '1564763358', pages: 163, publishedDate: '1994' },
  'auth_warren_wiersbe::w7': { isbn: '1434702162', publishedDate: '2010' },
  'auth_warren_wiersbe::w8': { coverId: 7797182, isbn: '1434700526', publishedDate: '2010' },
  'auth_warren_wiersbe::w9': { coverId: 800839, isbn: '9781564761224', pages: 168, publishedDate: '1993' },
  'auth_warren_wiersbe::w10': { coverId: 10438179, isbn: '9781898938019', pages: 168, publishedDate: '1994' },
  'auth_warren_wiersbe::w11': { coverId: 800837, isbn: '1564760677', pages: 177, publishedDate: '1993' },
  'auth_warren_wiersbe::w12': { coverId: 800922, isbn: '9781564767059', pages: 195, publishedDate: '2001' },
  'auth_warren_wiersbe::w13': { coverId: 800980, isbn: '1564767892', pages: 191, publishedDate: '2001' },
  'auth_warren_wiersbe::w14': { coverId: 800981, isbn: '9781564767905', pages: 204, publishedDate: '2002' },
  'auth_warren_wiersbe::w15': { coverId: 7590817, isbn: '9781434700513', publishedDate: '2010' },
  'auth_warren_wiersbe::w16': { coverId: 696158, isbn: '9781872059624', pages: 155, publishedDate: '1991' },
  'auth_warren_wiersbe::w17': { coverId: 12914944, isbn: '1434767396', pages: 288, publishedDate: '2009' },
  'auth_warren_wiersbe::w18': { coverId: 800862, isbn: '9781564764300', pages: 180, publishedDate: '1995' },
  'auth_warren_wiersbe::w19': { coverId: 800870, isbn: '9781564764898', pages: 204, publishedDate: '1995' },
  'auth_warren_wiersbe::w20': { coverId: 696122, isbn: '9780896933132', pages: 229, publishedDate: '1980' },

  // auth_dale_ralph_davis
  'auth_dale_ralph_davis::w1': { coverId: 4676302, isbn: '9780801029813', pages: 204, publishedDate: '1988' },
  'auth_dale_ralph_davis::w2': { coverId: 13019325, isbn: '9780801029967', pages: 227, publishedDate: '1990' },
  'auth_dale_ralph_davis::w3': { coverId: 910569, isbn: '9781857925166', pages: 288, publishedDate: '2003' },
  'auth_dale_ralph_davis::w4': { coverId: 910670, isbn: '9781857927030', pages: 352, publishedDate: '2002' },
  'auth_dale_ralph_davis::w5': { coverId: 2996025, isbn: '1857923359', pages: 304, publishedDate: '1999' },
  'auth_dale_ralph_davis::w6': { coverId: 2035112, isbn: '1845500962', pages: 344, publishedDate: '2005' },
  'auth_dale_ralph_davis::w7': { isbn: '9781974283927', publishedDate: '2017' },
  'auth_dale_ralph_davis::w8': { coverId: 14737611, isbn: '1844748014', pages: 171, publishedDate: '2013' },

  // auth_derek_kidner
  'auth_derek_kidner::w1': { isbn: '9780830848355', pages: 224, publishedDate: '1967' },
  'auth_derek_kidner::w2': { coverId: 7274750, isbn: '9780830842155', pages: 196, publishedDate: '2009' },
  'auth_derek_kidner::w3': { coverId: 671617, isbn: '0830842179', pages: 192, publishedDate: '1964' },
  'auth_derek_kidner::w4': { coverId: 12995486, isbn: '0877846472', pages: 110, publishedDate: '1976' },
  'auth_derek_kidner::w5': { coverId: 6554575, isbn: '0877842655', pages: 492, publishedDate: '1973' },
  'auth_derek_kidner::w6': { coverId: 12045698, isbn: '083089473X', pages: 175, publishedDate: '1979' },
  'auth_derek_kidner::w7': { coverId: 671635, isbn: '0851107303', pages: 142, publishedDate: '1981' },
  'auth_derek_kidner::w8': { coverId: 633126, isbn: '0830812253', pages: 176, publishedDate: '1987' },

  // auth_walter_brueggemann
  'auth_walter_brueggemann::w1': { coverId: 577093, isbn: '080423101X', pages: 384, publishedDate: '1982' },
  'auth_walter_brueggemann::w2': { coverId: 577101, isbn: '0804231087', pages: 362, publishedDate: '1990' },
  'auth_walter_brueggemann::w3': { coverId: 585887, isbn: '9780806621203', pages: 206, publishedDate: '1984' },
  'auth_walter_brueggemann::w4': { coverId: 399829, isbn: '0664255248', pages: 276, publishedDate: '1998' },
  'auth_walter_brueggemann::w5': { coverId: 571552, isbn: '080280280X', pages: 502, publishedDate: '1998' },
  'auth_walter_brueggemann::w6': { coverId: 1874498, isbn: '0884891437', pages: 116, publishedDate: '1982' },

  // auth_william_barclay
  'auth_william_barclay::w1': { coverId: 4644102, isbn: '9780715202883', pages: 389, publishedDate: '1975' },
  'auth_william_barclay::w2': { coverId: 399133, isbn: '9780664241049', publishedDate: '1975' },
  'auth_william_barclay::w3': { coverId: 8069705, isbn: '0664241069', pages: 193, publishedDate: '1976' },
  'auth_william_barclay::w4': { coverId: 399136, isbn: '9780664241070', pages: 222, publishedDate: '1957' },
  'auth_william_barclay::w5': { coverId: 14940358, pages: 390, publishedDate: '1956' },
  'auth_william_barclay::w6': { coverId: 10000606, isbn: '9780715200827', pages: 314, publishedDate: '1953' },
  'auth_william_barclay::w7': { coverId: 399137, isbn: '9780664213084', pages: 268, publishedDate: '1975' },
  'auth_william_barclay::w8': { coverId: 11020367, pages: 324, publishedDate: '1960' },
  'auth_william_barclay::w9': { isbn: '0715207423', pages: 212, publishedDate: '1976' },
  'auth_william_barclay::w10': { coverId: 398944, isbn: '0664226795', publishedDate: '1960' },

  // auth_f_f_bruce
  'auth_f_f_bruce::w1': { coverId: 572106, isbn: '0802825052', pages: 564, publishedDate: '1988' },
  'auth_f_f_bruce::w2': { coverId: 10977636, isbn: '9780802821836', pages: 512, publishedDate: '1981' },
  'auth_f_f_bruce::w3': { coverId: 572057, isbn: '0802823874', pages: 305, publishedDate: '1982' },
  'auth_f_f_bruce::w4': { coverId: 9354875, isbn: '9780851118550', pages: 288, publishedDate: '1963' },
  'auth_f_f_bruce::w5': { coverId: 572551, isbn: '9780521591089', pages: 302, publishedDate: '1997' },
  'auth_f_f_bruce::w6': { coverId: 7267763, isbn: '0802824013', pages: 442, publishedDate: '1984' },
  'auth_f_f_bruce::w7': { coverId: 13659255, isbn: '9780850094411', pages: 228, publishedDate: '1982' },
  'auth_f_f_bruce::w8': { coverId: 571941, isbn: '0802817831', pages: 160, publishedDate: '1970' },

  // auth_n_t_wright
  'auth_n_t_wright::w1': { coverId: 11000516, isbn: '9780664227876', publishedDate: '2004' },
  'auth_n_t_wright::w2': { coverId: 399001, isbn: '9780664227838', pages: 244, publishedDate: '2004' },
  'auth_n_t_wright::w3': { coverId: 155758, isbn: '028105312X', pages: 192, publishedDate: '2002' },
  'auth_n_t_wright::w4': { coverId: 11040626, isbn: '066422797X', pages: 227, publishedDate: '2011' },
  'auth_n_t_wright::w5': { coverId: 399002, isbn: '9780664227845', pages: 320, publishedDate: '2004' },
  'auth_n_t_wright::w6': { coverId: 155756, isbn: '0281053022', pages: 198, publishedDate: '2003' },
  'auth_n_t_wright::w7': { coverId: 1160212, isbn: '9780664227951', pages: 212, publishedDate: '2007' },
  'auth_n_t_wright::w8': { coverId: 155758, isbn: '028105312X', pages: 192, publishedDate: '2002' },
  'auth_n_t_wright::w9': { coverId: 399003, isbn: '0664227856', pages: 178, publishedDate: '2004' },
  'auth_n_t_wright::w10': { coverId: 399011, isbn: '0664227937', pages: 192, publishedDate: '2004' },

  // auth_john_stott
  'auth_john_stott::w1': { coverId: 11136941, isbn: '9780830821594', pages: 464, publishedDate: '2020' },
  'auth_john_stott::w2': { coverId: 671633, isbn: '9780877842880', pages: 191, publishedDate: '1968' },
  'auth_john_stott::w3': { coverId: 12668930, isbn: '9780877845874', pages: 291, publishedDate: '1979' },
  'auth_john_stott::w4': { coverId: 633140, isbn: '9780830812363', pages: 428, publishedDate: '1994' },
  'auth_john_stott::w5': { isbn: '083089781X', publishedDate: '2014' },
  'auth_john_stott::w6': { coverId: 10057516, isbn: '9780851107370', pages: 127, publishedDate: '1998' },
  'auth_john_stott::w7': { isbn: '9780851106960', pages: 224, publishedDate: '1990' },
  'auth_john_stott::w8': { coverId: 11603879, isbn: '085110584X', pages: 222, publishedDate: '1978' },

  // auth_william_hendriksen
  'auth_william_hendriksen::w1': { pages: 1015, publishedDate: '1973' },
  'auth_william_hendriksen::w2': { coverId: 5535322, isbn: '0801040515', pages: 776, publishedDate: '2002' },
  'auth_william_hendriksen::w3': { pages: 290, publishedDate: '1967' },
  'auth_william_hendriksen::w4': { coverId: 563384, isbn: '9780801018404', pages: 224, publishedDate: '1952' },
  'auth_william_hendriksen::w5': { coverId: 5535421, isbn: '0801042658', pages: 544, publishedDate: '1981' },

  // auth_leon_morris
  'auth_leon_morris::w1': { coverId: 6890553, isbn: '0802824293', pages: 880, publishedDate: '1971' },
  'auth_leon_morris::w2': { coverId: 572394, isbn: '0802836364', pages: 609, publishedDate: '1987' },
  'auth_leon_morris::w3': { coverId: 634081, isbn: '9780830842506', pages: 256, publishedDate: '1987' },
  'auth_leon_morris::w4': { coverId: 647884, isbn: '0830829822', pages: 382, publishedDate: '1988' },
  'auth_leon_morris::w5': { coverId: 1576350, isbn: '0802822576', pages: 249, publishedDate: '1958' },
  'auth_leon_morris::w6': { coverId: 2659542, isbn: '9780849907975', pages: 129, publishedDate: '1989' },
  'auth_leon_morris::w7': { coverId: 572398, isbn: '0802836968', pages: 781, publishedDate: '1992' },

  // auth_d_a_carson
  'auth_d_a_carson::w1': { coverId: 572396, isbn: '0802836836', pages: 715, publishedDate: '1991' },
  'auth_d_a_carson::w2': { coverId: 4421998, isbn: '0801024234', pages: 157, publishedDate: '1978' },

  // auth_john_macarthur
  'auth_john_macarthur::w1': { isbn: '157567677X', pages: 514, publishedDate: '1985' },
  'auth_john_macarthur::w2': { isbn: '1575676109', publishedDate: '1991' },
  'auth_john_macarthur::w3': { coverId: 569754, isbn: '9780802407535', pages: 438, publishedDate: '1983' },
  'auth_john_macarthur::w4': { isbn: '9781575676135', publishedDate: '1999' },
  'auth_john_macarthur::w5': { coverId: 7347513, isbn: '0802410308', publishedDate: '2015' },
  'auth_john_macarthur::w6': { coverId: 7156756, isbn: '0802408710', pages: 153, publishedDate: '1991' },
  'auth_john_macarthur::w7': { coverId: 7909489, isbn: '0802407714', pages: 528, publishedDate: '2006' },
  'auth_john_macarthur::w8': { coverId: 569765, isbn: '9780802407597', pages: 344, publishedDate: '1994' },
  'auth_john_macarthur::w9': { isbn: '9781575679433', publishedDate: '1984' },
  'auth_john_macarthur::w10': { isbn: '9781575676128', publishedDate: '1987' },
  'auth_john_macarthur::w11': { isbn: '1575676338', publishedDate: '1986' },
  'auth_john_macarthur::w12': { isbn: '9781575678436', publishedDate: '2001' },
  'auth_john_macarthur::w13': { coverId: 646645, isbn: '0802409008', pages: 308, publishedDate: '1998' },
  'auth_john_macarthur::w14': { isbn: '9781575676401', pages: 336, publishedDate: '2004' },

  // auth_r_c_sproul
  'auth_r_c_sproul::w1': { coverId: 7372713, isbn: '1433506858', publishedDate: '2009' },
  'auth_r_c_sproul::w2': { coverId: 12835842, isbn: '9781567691856', publishedDate: '2009' },
  'auth_r_c_sproul::w3': { isbn: '9781642891850', pages: 399, publishedDate: '2019' },
  'auth_r_c_sproul::w4': { isbn: '9781642891768', pages: 771, publishedDate: '2019' },
  'auth_r_c_sproul::w5': { coverId: 12046617, isbn: '9781642891799', pages: 393, publishedDate: '2019' },
  'auth_r_c_sproul::w6': { coverId: 14117706, isbn: '1642892815', pages: 595, publishedDate: '2020' },
  'auth_r_c_sproul::w7': { isbn: '1642894249', publishedDate: '2022' },
  'auth_r_c_sproul::w8': { isbn: '9781845506384', pages: 176, publishedDate: '2011' },
  'auth_r_c_sproul::w9': { coverId: 14353056, isbn: '9781433522895', pages: 291, publishedDate: '2011' },

  // auth_gordon_fee
  'auth_gordon_fee::w1': { coverId: 8649460, isbn: '9780802809247', pages: 880, publishedDate: '1987' },
  'auth_gordon_fee::w2': { coverId: 572110, isbn: '0802825117', pages: 497, publishedDate: '1995' },
  'auth_gordon_fee::w3': { coverId: 10693884, isbn: '0802863620', pages: 366, publishedDate: '2009' },
  'auth_gordon_fee::w4': { coverId: 12938892, isbn: '9781905679027', pages: 262, publishedDate: '2011' },

  // Women's-issues authors — verified via Open Library
  // auth_elisabeth_elliot
  'auth_elisabeth_elliot::w1': { coverId: 638714, isbn: '0842321616', pages: 190, publishedDate: '1976' },
  'auth_elisabeth_elliot::w2': { coverId: 561998, isbn: '0340387777', pages: 192, publishedDate: '1984' },
  'auth_elisabeth_elliot::w3': { coverId: 632932, isbn: '0802727166', pages: 201, publishedDate: '1990' },
  'auth_elisabeth_elliot::w4': { coverId: 562277, isbn: '156955255X', pages: 158, publishedDate: '1993' },

  // auth_nancy_demoss_wolgemuth
  'auth_nancy_demoss_wolgemuth::w1': { coverId: 570571, isbn: '9780802475978', pages: 288, publishedDate: '2001' },
  'auth_nancy_demoss_wolgemuth::w2': { coverId: 8867787, isbn: '0802412599', pages: 352, publishedDate: '2017' },
  'auth_nancy_demoss_wolgemuth::w3': { coverId: 7245310, isbn: '0802432522', pages: 240, publishedDate: '2009' },
  'auth_nancy_demoss_wolgemuth::w4': { coverId: 570118, isbn: '0802432530', pages: 224, publishedDate: '2006' },

  // auth_mary_kassian
  'auth_mary_kassian::w1': { coverId: 13598364, isbn: '0802403565', pages: 221, publishedDate: '2012' },
  'auth_mary_kassian::w2': { coverId: 12964016, isbn: '0802412580', pages: 268, publishedDate: '2015' },
  'auth_mary_kassian::w3': { coverId: 6667288, isbn: '157567551X', pages: 272, publishedDate: '2010' },
  'auth_mary_kassian::w4': { coverId: 842162, isbn: '9781433500251', pages: 336, publishedDate: '2005' },

  // auth_cynthia_heald
  'auth_cynthia_heald::w1': { coverId: 6941540, isbn: '9780891090663', pages: 123, publishedDate: '1999' },
  'auth_cynthia_heald::w2': { coverId: 688665, isbn: '9780891099543', pages: 101, publishedDate: '1996' },
  'auth_cynthia_heald::w3': { coverId: 688558, isbn: '0891096752', pages: 107, publishedDate: '1992' },
  'auth_cynthia_heald::w4': { coverId: 6647283, isbn: '9781576831878', pages: 92, publishedDate: '2000' },

  // auth_carolyn_mahaney
  'auth_carolyn_mahaney::w1': { coverId: 842184, isbn: '1581346158', pages: 167, publishedDate: '2003' },
  'auth_carolyn_mahaney::w2': { coverId: 842120, isbn: '1581345100', pages: 222, publishedDate: '2005' },
  'auth_carolyn_mahaney::w3': { coverId: 12507881, isbn: '9781433540370', pages: 128, publishedDate: '2014' },
  'auth_carolyn_mahaney::w4': { coverId: 10948525, isbn: '9781433552496', pages: 160, publishedDate: '2017' },

  // auth_susan_hunt
  'auth_susan_hunt::w1': { coverId: 1648452, isbn: '0891077197', pages: 200, publishedDate: '1993' },
  'auth_susan_hunt::w2': { coverId: 688443, isbn: '9781880692127', pages: 197, publishedDate: '1994' },
  'auth_susan_hunt::w3': { coverId: 688407, isbn: '0891079270', pages: 237, publishedDate: '1997' },
  'auth_susan_hunt::w4': { isbn: '9781433570100', pages: 160, publishedDate: '2021' },

  // auth_dee_brestin
  'auth_dee_brestin::w1': { coverId: 696128, isbn: '9780781444569', pages: 186, publishedDate: '1988' },
  'auth_dee_brestin::w2': { coverId: 2624070, isbn: '9780781444477', pages: 144, publishedDate: '2006' },
  'auth_dee_brestin::w3': { coverId: 10759003, isbn: '0310948827', pages: 203, publishedDate: '2009' },
  'auth_dee_brestin::w4': { coverId: 800933, isbn: '1564767310', pages: 155, publishedDate: '1998' },

  // auth_sally_clarkson
  'auth_sally_clarkson::w1': { coverId: 10508198, isbn: '9781515908838', pages: 137, publishedDate: '2016' },
  'auth_sally_clarkson::w2': { coverId: 8947746, isbn: '1613756615', pages: 247, publishedDate: '2014' },
  'auth_sally_clarkson::w3': { coverId: 835211, isbn: '0307564665', pages: 256, publishedDate: '2003' },
  'auth_sally_clarkson::w4': { coverId: 14458823, isbn: '149642011X', pages: 226, publishedDate: '2016' },

  // auth_linda_dillow
  'auth_linda_dillow::w1': { coverId: 831470, isbn: '1615215018', pages: 240, publishedDate: '1998' },
  'auth_linda_dillow::w2': { isbn: '1578561493', pages: 274, publishedDate: '1999' },
  'auth_linda_dillow::w3': { coverId: 1931085, isbn: '1576833909', pages: 303, publishedDate: '2007' },
  'auth_linda_dillow::w4': { coverId: 537188, isbn: '0840756488', pages: 216, publishedDate: '1977' },

  // auth_wendy_alsup
  'auth_wendy_alsup::w1': { coverId: 6425474, isbn: '1433502097', publishedDate: '2008' },
  'auth_wendy_alsup::w2': { coverId: 12322517, isbn: '9781451574821', pages: 144, publishedDate: '2012' },
  'auth_wendy_alsup::w3': { coverId: 6391258, isbn: '1450516696', pages: 176, publishedDate: '2010' },

  // auth_elyse_fitzpatrick
  'auth_elyse_fitzpatrick::w1': { coverId: 802662, isbn: '1565076176', pages: 573, publishedDate: '1997' },
  'auth_elyse_fitzpatrick::w2': { coverId: 667392, isbn: '9780875521985', pages: 232, publishedDate: '2001' },
  'auth_elyse_fitzpatrick::w3': { coverId: 10445802, isbn: '9781433528217', pages: 146, publishedDate: '2011' },
  'auth_elyse_fitzpatrick::w4': { coverId: 463944, isbn: '9780736905893', pages: 228, publishedDate: '2001' },

  // auth_carolyn_custis_james
  'auth_carolyn_custis_james::w1': { coverId: 12401943, isbn: '9780310522669', pages: 208, publishedDate: '2015' },
  'auth_carolyn_custis_james::w2': { isbn: '9780310297543', pages: 240, publishedDate: '2009' },
  'auth_carolyn_custis_james::w3': { isbn: '9780310330851', pages: 224, publishedDate: '2011' },
  'auth_carolyn_custis_james::w4': { isbn: '9781038763952', pages: 316, publishedDate: '2021' },

  // auth_melissa_kruger
  'auth_melissa_kruger::w1': { isbn: '9781433568015', pages: 176, publishedDate: '2020' },
  'auth_melissa_kruger::w2': { coverId: 7832155, isbn: '9781845507756', pages: 254, publishedDate: '2012' },
  'auth_melissa_kruger::w3': { isbn: '9781784984021', publishedDate: '2019' },
  'auth_melissa_kruger::w4': { coverId: 12428510, isbn: '9781784986629', publishedDate: '2022' },

  // auth_trillia_newbell
  'auth_trillia_newbell::w1': { coverId: 9001383, isbn: '9780802410146', pages: 160, publishedDate: '2014' },
  'auth_trillia_newbell::w2': { coverId: 8971812, isbn: '9780802410221', pages: 176, publishedDate: '2015' },
  'auth_trillia_newbell::w3': { coverId: 8893028, isbn: '9781601428523', pages: 240, publishedDate: '2016' },
  'auth_trillia_newbell::w4': { coverId: 12080420, isbn: '9780830845781', pages: 200, publishedDate: '2019' },

  // auth_rachel_jankovic
  'auth_rachel_jankovic::w1': { isbn: '9781591280811', publishedDate: '2010' },
  'auth_rachel_jankovic::w2': { isbn: '9781591281283', pages: 120, publishedDate: '2012' },
  'auth_rachel_jankovic::w3': { coverId: 12374561, isbn: '9781947644885', pages: 246, publishedDate: '2019' },
};
