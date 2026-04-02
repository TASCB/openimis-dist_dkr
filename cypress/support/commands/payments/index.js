import { registerPaymentPlanCommands } from './payment-plan.commands';
import { registerPaymentCycleCommands } from './payment-cycle.commands';

export function registerPaymentCommands() {
  registerPaymentPlanCommands();
  registerPaymentCycleCommands();
}
