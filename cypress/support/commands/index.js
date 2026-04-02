import { registerUiCommands } from './ui.commands';
import { registerAuthCommands } from './auth.commands';
import { registerAdminCommands } from './admin.commands';
import { registerRegistryCommands } from './registry.commands';
import { registerTaskCommands } from './tasks.commands';
import { registerProgramCommands } from './programs.commands';
import { registerGrievanceCommands } from './grievance.commands';
import { registerPaymentCommands } from './payments';

registerUiCommands();
registerAuthCommands();
registerAdminCommands();
registerRegistryCommands();
registerTaskCommands();
registerProgramCommands();
registerGrievanceCommands();
registerPaymentCommands();
