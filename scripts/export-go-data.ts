/** Writes the catalogue, sample diagram and name lists the Go binary embeds, straight from the TypeScript source so they cannot drift. */
import { writeFileSync, copyFileSync } from 'node:fs'
import { SEED_CATALOGUE } from '../src/lib/seed'
import { sampleDoc, tidy } from '../src/lib/doc'
import { ICON_NAMES, BRAND_NAMES } from '../src/lib/iconKeys'
import { MARK_COLORS } from '../src/lib/palette'
import { LOGO_PATH, LOGO_VIEWBOX, LOGO_RATIO } from '../src/lib/logo'

const out = (f: string, v: unknown) => writeFileSync(`go/data/${f}`, JSON.stringify(v, null, 1) + '\n')
out('catalogue.json', SEED_CATALOGUE)
out('sample.json', tidy(sampleDoc()))
out('meta.json', { icons: ICON_NAMES, brands: BRAND_NAMES, colors: MARK_COLORS, logoPath: LOGO_PATH, logoViewBox: LOGO_VIEWBOX, logoRatio: LOGO_RATIO })
copyFileSync('src/assets/waves.png', 'go/data/waves.png')
console.log('go/data written')
