import { useState } from 'react';

export function FloatingCalculator({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  async function calculate() {
    if (!expression.trim()) return;
    try {
      const { default: nerdamer } = await import('nerdamer-prime');
      const answer = nerdamer(expression).evaluate();
      setResult(`${answer.toString()} ≈ ${answer.text('decimals')}`);
      setError('');
    } catch {
      setResult('');
      setError('Check the expression.');
    }
  }
  return (
    <div className="floating-calculator">
      {open && (
        <section className="calculator-popover" aria-label="Floating scientific calculator" data-testid="floating-calculator">
          <header><strong>Calculator</strong><button type="button" aria-label="Close calculator" onClick={onToggle}>×</button></header>
          <input autoFocus aria-label="Calculator expression" value={expression} placeholder="6*4 or sqrt(81)" onChange={(event) => setExpression(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void calculate(); }} />
          <div className="calculator-keys">
            {['7','8','9','/','4','5','6','*','1','2','3','-','0','.','(',')','+','^','sqrt(', 'pi'].map((key) => <button type="button" key={key} onClick={() => setExpression((current) => `${current}${key}`)}>{key}</button>)}
          </div>
          <button type="button" className="calculator-equals" onClick={() => void calculate()}>=</button>
          {result && <output>{result}</output>}
          {error && <p>{error}</p>}
        </section>
      )}
      <button type="button" className="calculator-launcher" aria-label={open ? 'Hide calculator' : 'Open calculator'} aria-pressed={open} onClick={onToggle}>123</button>
    </div>
  );
}
