import { Alerter } from "@superset/ui/atoms/Alert";
import type { ReactNode } from "react";
import { ThemedToaster } from "components/ThemedToaster";
import { ElectronTRPCProvider } from "providers/ElectronTRPCProvider";

export function RootLayout({ children }: { children: ReactNode }) {
	return (
		<ElectronTRPCProvider>
			{children}
			<ThemedToaster />
			<Alerter />
		</ElectronTRPCProvider>
	);
}
