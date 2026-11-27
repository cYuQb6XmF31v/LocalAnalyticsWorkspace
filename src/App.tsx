import { AppShell } from './app/AppShell';
import { ProjectProvider } from './app/ProjectContext';
import { UiEffectsProvider } from './app/uiEffects';

export function App() {
  return (
    <ProjectProvider>
      <UiEffectsProvider>
        <AppShell />
      </UiEffectsProvider>
    </ProjectProvider>
  );
}
