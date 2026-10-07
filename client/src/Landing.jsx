import { Icon, Logo } from './icons.jsx';
const FEATURES = [
  ['people', 'Matching that works both ways', 'You only see people whose age range includes you and who fall inside yours. No awkward mismatches.'],
  ['eye', 'Private until you both say yes', 'Your country and details stay hidden until the two of you choose to share them.'],
  ['shield', 'Consent for adult content', 'Sexual content stays off unless both people are 18+ and both switch it on. View-once and self-destruct media follow the same rule.'],
  ['camera', 'Real people', 'A live selfie and email check at signup, plus reporting, blocking and human review.'],
  ['mic', 'Chat the way you already do', 'Voice notes, photos, video, status updates, edit and delete, and read receipts you can switch off.'],
  ['globe', 'Made for everywhere', 'Installs from your browser, stays light on data, and translates messages on your device where supported.'],
];
const STEPS = [['Sign up', 'Add your age, take a quick live selfie and confirm your email.'], ['Set your range', 'Choose who you want to meet and the age range that suits you.'], ['Start talking', 'Send a request. Reveal more only when you both feel comfortable.']];
export default function Landing({ onStart }) {
  return <div className="land">
    <header className="lnav"><Logo /><span className="grow" /><a href="#features">Features</a><a href="#safety">Safety</a>
      <button onClick={() => onStart('login')}>Log in</button><button className="primary" onClick={() => onStart('register')}>Get started</button></header>
    <section className="hero">
      <div><span className="pill">Social and dating, on your terms</span>
        <h1>Meet people your age, <span className="grad">without oversharing.</span></h1>
        <p>A chat app for friendships and dating where age ranges match both ways, details stay hidden until you both agree, and adult content always needs everyone's consent.</p>
        <div className="cta"><button className="primary big" onClick={() => onStart('register')}>Create your account <Icon n="arrow" s={18} /></button><button className="big" onClick={() => onStart('login')}>I already have one</button></div></div>
      <div className="mock" aria-hidden="true"><div className="mhead"><span className="av" style={{ width: 36, height: 36, background: '#0f9d8a' }}>A</span><div><b>Amara</b><small>online</small></div></div>
        <div className="mbody"><p className="in">Hey! Your range includes me too, nice.</p><p className="out">Ha, that's the idea. How's your week going?</p>
          <p className="in vo"><span className="once">1</span> Photo</p><p className="out">Opened. Love that view!</p></div>
        <div className="mfoot"><span>Type a message</span><b><Icon n="mic" s={18} /></b></div></div>
    </section>
    <section id="features" className="band"><h2>Everything you expect, with the safety built in</h2>
      <div className="grid">{FEATURES.map(([ic, t, d]) => <div key={t} className="fcard"><span className="fic"><Icon n={ic} /></span><h3>{t}</h3><p>{d}</p></div>)}</div></section>
    <section className="band alt"><h2>How it works</h2>
      <div className="steps">{STEPS.map(([t, d], i) => <div key={t}><b>{i + 1}</b><h3>{t}</h3><p>{d}</p></div>)}</div></section>
    <section id="safety" className="band"><div className="safety"><div><h2>Safety is not an extra</h2>
      <p>People under 18 only meet other teens close to their age, and adult features stay locked for them. Everyone can block and report in one tap, and notifications are discreet by default.</p></div>
      <ul><li><Icon n="check" s={18} /> Teens and adults are never matched together</li><li><Icon n="check" s={18} /> Sexual content needs two adults and two opt-ins</li>
        <li><Icon n="check" s={18} /> Photos and videos are screened before they are sent</li><li><Icon n="check" s={18} /> App lock and a hidden rainbow flag by default</li></ul></div></section>
    <footer className="lfoot"><Logo size={26} /><span className="grow" /><small>© {new Date().getFullYear()} Tumblrr</small><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Contact</a></footer>
  </div>;
}
