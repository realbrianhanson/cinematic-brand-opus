const AmbientOrbs = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      <div
        className="absolute animate-[orbFloat0_25s_ease-in-out_infinite]"
        style={{
          left: "15%",
          top: "20%",
          width: 300,
          height: 300,
          background: "radial-gradient(circle, #D4AF55 0%, transparent 70%)",
          opacity: 0.03,
          filter: "blur(60px)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        className="absolute animate-[orbFloat1_35s_ease-in-out_infinite]"
        style={{
          left: "75%",
          top: "60%",
          width: 400,
          height: 400,
          background: "radial-gradient(circle, #B8962E 0%, transparent 70%)",
          opacity: 0.025,
          filter: "blur(60px)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        className="absolute animate-[orbFloat2_30s_ease-in-out_infinite]"
        style={{
          left: "50%",
          top: "80%",
          width: 250,
          height: 250,
          background: "radial-gradient(circle, #D4AF55 0%, transparent 70%)",
          opacity: 0.02,
          filter: "blur(60px)",
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
};

export default AmbientOrbs;
