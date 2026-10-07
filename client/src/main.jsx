import { createRoot } from 'react-dom/client'; import App from './App.jsx'; import Boundary from './Boundary.jsx'; import { Host } from './ui.jsx'; import '@fontsource-variable/inter'; import '@fontsource-variable/manrope'; import './styles.css';
createRoot(document.getElementById('root')).render(<Boundary><App /><Host /></Boundary>);
