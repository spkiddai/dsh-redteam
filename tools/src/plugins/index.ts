import { defineToolPlugin, type RedTeamToolPlugin } from '../plugin.js'
import { registerBurpTools } from './burp/index.js'
import { registerMetasploitTools } from './metasploit/index.js'
import { registerNmapTools } from './nmap/index.js'
import { registerNucleiTools } from './nuclei/index.js'

export const builtInToolPlugins: readonly RedTeamToolPlugin[] = [
  defineToolPlugin({ name: 'nmap', register: registerNmapTools }),
  defineToolPlugin({ name: 'burp', register: registerBurpTools }),
  defineToolPlugin({ name: 'metasploit', register: registerMetasploitTools }),
  defineToolPlugin({ name: 'nuclei', register: registerNucleiTools }),
]
