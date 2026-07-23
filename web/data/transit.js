// Bangkok rapid-transit network (central) + Chao Phraya piers.
// Station coordinates are curated/approximate — accurate enough for
// nearest-station snapping and hop-count travel-time estimation.
// Stations are listed in line order (used to count hops between them).
window.TRANSIT = {
  lines: [
    {
      id: "BTS-Sukhumvit", name: "BTS Sukhumvit", color: "#4CAF50",
      stations: [
        ["Mo Chit", 100.5537, 13.8025], ["Saphan Khwai", 100.5497, 13.7938],
        ["Ari", 100.5445, 13.7797], ["Sanam Pao", 100.5406, 13.7737],
        ["Victory Monument", 100.5374, 13.7649], ["Phaya Thai", 100.5337, 13.7568],
        ["Ratchathewi", 100.5316, 13.7519], ["Siam", 100.5340, 13.7455],
        ["Chit Lom", 100.5432, 13.7442], ["Phloen Chit", 100.5488, 13.7431],
        ["Nana", 100.5551, 13.7404], ["Asok", 100.5601, 13.7367],
        ["Phrom Phong", 100.5697, 13.7304], ["Thong Lo", 100.5786, 13.7240],
        ["Ekkamai", 100.5853, 13.7194], ["Phra Khanong", 100.5918, 13.7154],
        ["On Nut", 100.6013, 13.7057], ["Udom Suk", 100.6098, 13.6800],
        ["Bang Na", 100.6045, 13.6680]
      ]
    },
    {
      id: "BTS-Silom", name: "BTS Silom", color: "#009688",
      stations: [
        ["National Stadium", 100.5293, 13.7464], ["Siam", 100.5340, 13.7455],
        ["Ratchadamri", 100.5391, 13.7398], ["Sala Daeng", 100.5342, 13.7286],
        ["Chong Nonsi", 100.5292, 13.7237], ["Saint Louis", 100.5250, 13.7210],
        ["Surasak", 100.5220, 13.7191], ["Saphan Taksin", 100.5145, 13.7188],
        ["Krung Thon Buri", 100.5090, 13.7213], ["Wongwian Yai", 100.4986, 13.7213],
        ["Pho Nimit", 100.4862, 13.7150], ["Talat Phlu", 100.4762, 13.7134],
        ["Wutthakat", 100.4677, 13.7205], ["Bang Wa", 100.4560, 13.7205]
      ]
    },
    {
      id: "MRT-Blue", name: "MRT Blue", color: "#1565C0",
      stations: [
        ["Chatuchak Park", 100.5540, 13.8022], ["Phahon Yothin", 100.5620, 13.8135],
        ["Lat Phrao", 100.5745, 13.8163], ["Phra Ram 9", 100.5655, 13.7576],
        ["Phetchaburi", 100.5648, 13.7486], ["Sukhumvit", 100.5601, 13.7378],
        ["Queen Sirikit", 100.5602, 13.7237], ["Khlong Toei", 100.5537, 13.7226],
        ["Lumphini", 100.5457, 13.7256], ["Si Lom", 100.5340, 13.7290],
        ["Sam Yan", 100.5290, 13.7328], ["Hua Lamphong", 100.5170, 13.7373],
        ["Wat Mangkon", 100.5106, 13.7430], ["Sam Yot", 100.5010, 13.7466],
        ["Sanam Chai", 100.4940, 13.7430], ["Itsaraphap", 100.4867, 13.7397]
      ]
    }
  ],
  // Chao Phraya Express Boat piers (south -> north), used for river routing.
  piers: [
    ["Sathorn (Central)", 100.5145, 13.7188], ["Oriental", 100.5140, 13.7235],
    ["Si Phraya (ICONSIAM)", 100.5128, 13.7266], ["Ratchawong", 100.5085, 13.7338],
    ["Marine Dept", 100.5060, 13.7378], ["Rachini", 100.4960, 13.7420],
    ["Tha Tien (Wat Pho)", 100.4915, 13.7433], ["Tha Chang (Grand Palace)", 100.4905, 13.7502],
    ["Maharaj", 100.4900, 13.7540], ["Phra Arthit (Khaosan)", 100.4945, 13.7607],
    ["Wat Arun (cross-river)", 100.4889, 13.7437]
  ]
};
