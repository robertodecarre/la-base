# mesh3d.gallery Survey (Sep 2026)

Scraped all 422 website entries from the sitemap, resolved real URLs, downloaded each homepage + up to 25 JS bundles and matched library signatures. 388 sites analyzable. Percentages are approximate (regex fingerprints; minified/obfuscated or lazy-loaded bundles are under-counted; `webgpu` includes sites that merely ship three's WebGPU code paths). Full per-site data: `mesh3d-catalog.tsv` (grep it for inspiration by tag/maker).

## Detected stack

| Tech | Sites | % |
|---|---|---|
| custom-shaders | 279 | 72% |
| three | 265 | 68% |
| gsap | 240 | 62% |
| gltf | 232 | 60% |
| scrolltrigger | 230 | 59% |
| draco | 207 | 53% |
| ktx2/basis | 199 | 51% |
| meshopt | 189 | 49% |
| lenis | 160 | 41% |
| postprocessing | 145 | 37% |
| webgpu | 126 | 32% |
| r3f | 84 | 22% |
| vue | 84 | 22% |
| nextjs | 82 | 21% |
| howler | 78 | 20% |
| msdf-text | 53 | 14% |
| nuxt | 53 | 14% |
| gpgpu | 48 | 12% |
| tweakpane/lil-gui | 46 | 12% |
| webflow | 33 | 9% |
| astro | 30 | 8% |
| barba/swup | 21 | 5% |
| drei | 18 | 5% |
| theatre | 18 | 5% |
| svelte | 16 | 4% |
| rapier/cannon | 15 | 4% |
| spline | 8 | 2% |
| pixi | 5 | 1% |
| framer | 4 | 1% |
| hydra(ActiveTheory) | 3 | 1% |
| playcanvas | 1 | 0% |
| ogl | 1 | 0% |

**Takeaway:** the industry default is Three.js + custom GLSL + GSAP/ScrollTrigger (+ Lenis) + compressed glTF. R3F is a minority (~22%), popular with Next.js shops (Basement, Shader Studio, JOYCO). Top agencies ship their own frameworks (Active Theory Hydra) or vanilla three with Vue/Nuxt (Merci-Michel, Immersive Garden, Noomo) or Astro (Lusion).

## Most featured makers

| Maker | Entries |
|---|---|
| Unseen Studio® | 24 |
| PeachWeb | 24 |
| Lusion | 13 |
| Merci-Michel | 13 |
| Immersive Garden | 12 |
| Noomo Agency | 8 |
| Dogstudio | 8 |
| Active Theory | 7 |
| Bruno Simon | 6 |
| Rogier de Boevé | 6 |
| Samuel Honigstein | 6 |
| Anderson Mancini | 5 |
| OFF+BRAND | 5 |
| Christian Ortiz | 4 |
| Utsubo | 4 |
| Basement Studio | 4 |
| HOLM & Canberk | 4 |
| /nk.studio ® | 4 |
| Shader Development Studio | 3 |
| Monks | 3 |

## Tag frequency (what the 3D web is used for)

Interactive (156), Portfolio (107), Technology (92), Agency (90), Experimental (83), Creative (74), Art (58), Educational (53), Gaming (52), Particles (49), Architecture (46), Gallery (44), Nature (39), AI (33), Globe & spheres (32), Corporate (32), Playful (30), Sci-fi (30), Shader (29), Device & product (28), Fintech (28), Animals (25), Fashion (24), Landing Page (24), Logo (23), E-commerce (22), Crypto & blockchain (19), Minimalist (17), Procedural (16), Music (14), People (14), Food & drinks (14), City (13), Health & Wellness (12), Illustration (9), Film (9), Automotive (8), Non-profit (8), Anime (8), SaaS (6), Sport (6), Cartoon (6), NFT (4), Restaurant (3), Typography (3)


## Exemplars by category (study these before designing)

### E-commerce
- [AZERO Industries - Welcome to our warehouse](https://www.azero.industries/) — AZERO
- [bella - Kitchenware brand](https://bellakitchenware.com/) — ?
- [Merge - Digital Shapers](https://mergeinto.digital/) — ?
- [Three.js Conf Paris](https://threejs.paris/) — Hervé Studio
- [PIXELVAULT – An Immersive Creative Marketplace from earth 2047](https://www.pixelvault.fit) — Karan Chouhan & Harshit Kumar Sahu
- [adidas - CHILE20](https://adidaschile20.com/) — ?

### Food & drinks
- [ActiveHop - Sparkling Hop Water | Outdoor Inside](https://active-hop.com) — Six Socks Studio
- [Home — PRO meat](https://promeat.chipsa.design) — Chipsa
- [SOM | Modern Elixir From Ancient Core](https://www.drinksom.eu/) — .raw
- [/zeroz（ゼロズ）公式サイト | 大塚製薬](https://otsuka-air.jp/) — ?
- [Santioni Spirits | Cocktails to Indulge Now, Atone Later](https://santionispirits.com/) — Active Theory
- [Ciao Energy - L’energy drink parfaite](https://www.ciaoenergy.com/) — Skaald

### Device & product
- [bella - Kitchenware brand](https://bellakitchenware.com/) — ?
- [Steering wheel configurator](https://custom.gomezsimindustries.com/) — Anderson Mancini
- [FS 60P - The timeless automatic watch by 60fps](https://thewatch.60fps.fr/) — 60fps
- [Buttermax](https://buttermax.net) — Active Theory
- [Ayush's Portfolio](https://ayushdhibardesigns.framer.website/) — Ayush Dhibar
- [Ricky - Not just another boring AI companion](https://www.whoisricky.lol/) — Studio 9P

### Fashion
- [AZERO Industries - Welcome to our warehouse](https://www.azero.industries/) — AZERO
- [FS 60P - The timeless automatic watch by 60fps](https://thewatch.60fps.fr/) — 60fps
- [Air Jordan 4 Translucent](https://jordans.peachworlds.com) — PeachWeb
- [PIXELVAULT – An Immersive Creative Marketplace from earth 2047](https://www.pixelvault.fit) — Karan Chouhan & Harshit Kumar Sahu
- [adidas - CHILE20](https://adidaschile20.com/) — ?
- [Home - 25 Residences](https://25residences.com/) — Unseen Studio®

### Automotive
- [Steering wheel configurator](https://custom.gomezsimindustries.com/) — Anderson Mancini
- [FanZone36 : Alpine Elf Matmut Endurance Team](https://2021.fanzone36.com) — STUDIO PHA5E
- [Vello Ventures — Speed is engineering.](https://velloventures.com/) — Stoika
- [Montblanc Legend Red - The Race](https://therace.montblanclegend.com/en-us) — Merci-Michel
- [Orano](https://orano.group) — Bruno Simon
- [The Field: a Mixed-Reality Experience](https://thefieldhyundai.com) — Active Theory

### Fintech
- [BITKRAFT — Venture Capital for Gaming & Emerging Technology](https://bitkraft.vc) — Monks
- [Montfort Group](https://mont-fort.com) — Immersive Garden
- [Razorpay Sprint 2026: The Age of AI-Native Payments](https://razorpay.com/sprint/26) — ?
- [Yamauchi No.10 Family Office](https://y-n10.com/) — mount inc.
- [Coastal World - Digital Banking 3D Game and Marketplace](https://coastalworld.com/) — Merci-Michel
- [Gleec Coin](https://gleec.com/card) — Immersive Garden

### AI
- [BITKRAFT — Venture Capital for Gaming & Emerging Technology](https://bitkraft.vc) — Monks
- [Merge - Digital Shapers](https://mergeinto.digital/) — ?
- [Ricky - Not just another boring AI companion](https://www.whoisricky.lol/) — Studio 9P
- [Razorpay Sprint 2026: The Age of AI-Native Payments](https://razorpay.com/sprint/26) — ?
- [Sazabi](https://www.sazabi.com) — JOYCO
- [Epiminds — Agentic AI for Marketing](https://epiminds.com) — PeachWeb

### Architecture
- [Unseen Studio® – Brand, Digital & Motion](https://unseen.co/) — Unseen Studio®
- [Vertex3D — Immersive WebGL Experience Studio](https://www.vertex3d.asia/) — Yann Trévelot
- [Digital City](https://exp-digital-city.lusion.co/) — Lusion
- [UTB celebrates 25 years](https://jenamdvacetpet.cz/) — ?
- [Home - 25 Residences](https://25residences.com/) — Unseen Studio®
- [KidSuper World](https://kidsuper.world) — Basement Studio

### Health & Wellness
- [SOM | Modern Elixir From Ancient Core](https://www.drinksom.eu/) — .raw
- [Kriss.ai](https://kriss.ai) — Studio 28K
- [Garri Zmudze | Deep Tech, Health Tech and Longevity Investor](https://garrizmudze.com) — PeachWeb
- [South Cliff Dental Group - NHS and Private Dental Practices](https://southcliffdentalgroup.com/) — Anderson Mancini
- [The Future of Beauty | Explore Lead, the Future of Beauty Education](https://loreal-lead.unseen.co/) — Unseen Studio®
- [Vibrant Wellness | Interactive Digital Health Experience](https://vibrant.noomoagency.com) — Noomo Agency

### Music
- [Astronomy Experience 3D Experience](https://zos.undreamstudio.com/) — Undream Studio
- [BMSG FES’25](https://bmsgfes.tokyo/2025) — tote
- [Yamê - The Molazone](https://mola-zone.com/) — Studio 9P
- [A24 — Films](https://a24.raviklaassens.com/) — R—K
- [Hertzwerk](https://hertzwerk.ch) — Hertzwerk
- [Noomo Beat — Personalized AI Audiovisual Experience.](https://beat.noomoagency.com) — Noomo Agency

### Film
- [A24 — Films](https://a24.raviklaassens.com/) — R—K
- [Hall of Zero Limits](https://wakanda-forever-master.dogstudio-dev.co/zerolimits) — Dogstudio
- [CUTOBOT](https://cutobot.byholm.co/) — HOLM & Canberk
- [Godzilla](https://godzilla.peachworlds.com) — PeachWeb
- [Film Secession](https://filmsecession.com) — Rogier de Boevé
- [Jeroen (Jay) Ransijn — Design Engineer](https://jayransijn.com/) — Jeroen (Jay) Ransijn

### Illustration
- [Bonhomme | 10 ans](https://anniversary.bonhommeparis.com) — Bruno Simon
- [Enginzyme](https://www.enginzyme.com/technology) — Numbered
- [KidSuper World](https://kidsuper.world) — Basement Studio
- [Pierret - Dream House](https://dreamhouse.pierret.net/fr/) — Merci-Michel
- [Summer Afternoon](https://summer-afternoon.vlucendo.com/) — ?
- [The Monolith Project](https://themonolithproject.net/) — The Monolith Project

### Anime
- [RTFKT: CLONEX NFT AVATARS](https://clonex.rtfkt.com/) — Samuel Honigstein
- [Summer Afternoon](https://summer-afternoon.vlucendo.com/) — ?
- [Sougen](https://sougen.co) — Utsubo
- [The Monolith Project](https://themonolithproject.net/) — The Monolith Project
- [StringTune -cutting-edge JavaScript library](https://string-tune.fiddle.digital/) — ?
- [Ameen Abdullah | Creative Developer Portfolio](https://ameen-abdullah.dev/) — Lucerrá

### Particles
- [Novacellix | Creating Tomorrow’s Cellular Technologies](https://unseen.co/labs/cellular/) — Unseen Studio®
- [BITKRAFT — Venture Capital for Gaming & Emerging Technology](https://bitkraft.vc) — Monks
- [Bear 71 VR](https://bear71vr.nfb.ca) — Monks
- [Sebastien Lempen's Lab](https://lab77.sebastien-lempens.com/) — Sebastien Lempens
- [Ming Jyun Hung | Creative Technologist](https://mingjyunhung.com/) — Ming Jyun Hung
- [Enginzyme](https://www.enginzyme.com/technology) — Numbered

### Shader
- [Storytelling | The power of digital](https://storytelling.noomoagency.com/) — Noomo Agency
- [Future Web Design – The difference is in the details](https://fwdapps.net/) — Tibi
- [Dappled Studios — web design, app development & AI automations](https://dappled.com.au/) — Dappled
- [DICH™ Fashion | A New Era of Futuristic Fashion](https://dich-fashion.webflow.io/) — BL/S®
- [Guillaume Colombel — Freelance Interactive Developer](https://guillaumecolombel.fr/) — Guillaume Colombel
- [Mohammed Alkebsi's Portfolio](https://mkebsi.com/) — Mohammed Alkebsi

### Gaming
- [AKARI - A 2D light tracing experiment by Lusion.](https://akari.lusion.co/#ballpass) — Lusion
- [Lore](https://www.loreobsessed.com/) — darkroom.engineering
- [Aten7 - Toom Archives](https://www.aten7.com/) — Immersive Garden
- [BITKRAFT — Venture Capital for Gaming & Emerging Technology](https://bitkraft.vc) — Monks
- [Hank Berger’s Portfolio](https://h4nk.com) — Hank Berger
- [Ayush's Portfolio](https://ayushdhibardesigns.framer.website/) — Ayush Dhibar

### Educational
- [Lore](https://www.loreobsessed.com/) — darkroom.engineering
- [Bear 71 VR](https://bear71vr.nfb.ca) — Monks
- [OceanX 2025 Year in Review](https://2025.oceanx.org/) — Unseen Studio®
- [The Year of Greta](https://theyearofgreta.com/) — Monks
- [Three.js Conf Paris](https://threejs.paris/) — Hervé Studio
- [SPIN A TALE](https://brand.ivress.co.jp/) — Utsubo

### Non-profit
- [Contra | The Freelance Industry](https://contra.com/freelance-industry-report-2021/) — Unseen Studio®
- [Give A Hand — AI](https://giveahand.ai) — Hello Monday
- [100 Lost Species](https://www.100lostspecies.com/) — Immersive Garden
- [Sea Shepherd - No-fishing.net](https://www.no-fishing.net/) — makemepulse
- [Stonewall ForeverStonewall ForeverStonewall ForeverHelpClose](https://stonewallforever.org) — Samuel Honigstein
- [The Sea We Breathe](https://www.bluemarinefoundation.com/the-sea-we-breathe/) — Unseen Studio®

### Corporate
- [BlueYard Capital - blueyard.com](https://blueyard.com/) — Unseen Studio®
- [DFFRNT-ERA Group LTD](https://dffrnt-era-02.vercel.app/) — Kadir Inan
- [Montfort Group](https://mont-fort.com) — Immersive Garden
- [Enginzyme](https://www.enginzyme.com/technology) — Numbered
- [Yamauchi No.10 Family Office](https://y-n10.com/) — mount inc.
- [Crosswire](https://crosswire.unseen.co/) — Unseen Studio®

### Portfolio
- [Prasoon's Portfolio](https://prasoon-mahawar.dev/interesting) — Prasoon
- [Forged :: A Creative Studio](https://forged.build/) — Forged
- [Anyflow labs](https://labs.anyflow.agency) — Anyflow Labs
- [Unseen Studio® – Brand, Digital & Motion](https://unseen.co/) — Unseen Studio®
- [Active Theory · Creative Digital Experiences](https://activetheory.net/) — Active Theory
- [Vertex3D — Immersive WebGL Experience Studio](https://www.vertex3d.asia/) — Yann Trévelot

### Agency
- [Anyflow labs](https://labs.anyflow.agency) — Anyflow Labs
- [Unseen Studio® – Brand, Digital & Motion](https://unseen.co/) — Unseen Studio®
- [Active Theory · Creative Digital Experiences](https://activetheory.net/) — Active Theory
- [Shader Development Studio](https://shader.se/) — Shader Development Studio
- [Vertex3D — Immersive WebGL Experience Studio](https://www.vertex3d.asia/) — Yann Trévelot
- [Silencio](https://silencio.es/) — ?

### Landing Page
- [Tenbin Labs](https://tenbinlabs.xyz/) — PeachWeb
- [Shader Development Studio](https://shader.se/) — Shader Development Studio
- [DFFRNT-ERA Group LTD](https://dffrnt-era-02.vercel.app/) — Kadir Inan
- [PeachWeb I Stunning Interactive 3D Websites Without Code](https://creativemarketing.peachweb.io/) — PeachWeb
- [Ricky - Not just another boring AI companion](https://www.whoisricky.lol/) — Studio 9P
- [Three.js Conf Paris](https://threejs.paris/) — Hervé Studio
