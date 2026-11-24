// The tourist theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in tourist.settings.json and the generated tourist.settings.ts;
// change them with `astryx experimental theme editor set tourist ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {touristSettings} from './tourist.settings';

export const touristTheme = defineTheme({
  extends: touristSettings,
  name: 'tourist',
});
