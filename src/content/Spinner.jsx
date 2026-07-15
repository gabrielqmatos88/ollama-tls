import "./spinner.css";

export default function Spinner({ text = "Processing..." }) {
  return (
    <div className="crjsx-spinner-overlay">
      <div className="crjsx-spinner" />
      <span className="crjsx-spinner-text">{text}</span>
    </div>
  );
}
