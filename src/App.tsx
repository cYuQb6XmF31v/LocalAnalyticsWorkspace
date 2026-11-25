import { AppShell } from './app/AppShell';
import { ProjectProvider } from './app/ProjectContext';

export function App() {
  return (
    <ProjectProvider>
      <AppShell />
    </ProjectProvider>
  );
}
