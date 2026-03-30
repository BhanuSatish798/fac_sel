import { useNavigate } from "react-router-dom";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-transparent text-[#0f172a] relative overflow-hidden flex flex-col">
      {/* Immersive Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#7c3aed]/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-blue-500/5 blur-[100px] rounded-full" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-10 pointer-events-none" 
           style={{ backgroundImage: "radial-gradient(circle at center, #94a3b8 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center p-8 lg:p-24 gap-16 relative z-10">
        <div className="flex-1 space-y-8 text-center lg:text-left">
          <div className="inline-flex items-center gap-3 px-4 py-2 glass-card rounded-full">
            <div className="w-2 h-2 rounded-full bg-[#7c3aed] animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">System_V2.0.4_Stable</span>
          </div>
          
          <h1 className="text-4xl sm:text-6xl lg:text-[100px] leading-[0.85] tracking-tighter serif-italic text-slate-900">
            Faculty<br />
            <span className="text-[#7c3aed]">Selection</span>
          </h1>
          
          <p className="max-w-md text-lg text-slate-500 font-light leading-relaxed">
            A premium interface for academic resource allocation. 
            Seamlessly connecting students with distinguished faculty members.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-6 w-full lg:w-auto">
          {/* Student Portal Card */}
          <motion.div
            whileHover={{ scale: 1.02, translateY: -5 }}
            onClick={() => navigate("/student/login")}
            className="glass-card p-10 rounded-[40px] w-full sm:w-[320px] cursor-pointer group relative overflow-hidden accent-glow"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#7c3aed]/5 rounded-bl-full -mr-8 -mt-8 group-hover:bg-[#7c3aed]/10 transition-colors" />
            <div className="relative z-10">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-[#7c3aed]/20 transition-all">
                <GraduationCap size={32} className="text-[#7c3aed]" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Student_Portal</h3>
              <p className="text-sm text-slate-500 mb-8">Initialize your academic journey and select your mentors.</p>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#7c3aed]">
                <span>Enter_Session</span>
                <div className="h-px flex-1 bg-[#7c3aed]/20" />
              </div>
            </div>
          </motion.div>

          {/* Admin Portal Card */}
          <motion.div
            whileHover={{ scale: 1.02, translateY: -5 }}
            onClick={() => navigate("/admin/login")}
            className="glass-card p-10 rounded-[40px] w-full sm:w-[320px] cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-100 rounded-bl-full -mr-8 -mt-8 group-hover:bg-slate-200 transition-colors" />
            <div className="relative z-10">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-slate-200 transition-all">
                <ShieldCheck size={32} className="text-slate-400" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Admin_Access</h3>
              <p className="text-sm text-slate-500 mb-8">Elevated controls for system monitoring and management.</p>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <span>Authenticate</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="p-8 lg:px-24 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 relative z-10">
        <div className="flex items-center gap-6 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <span>© 2026 RGMCET_SYS</span>
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          <span>Encrypted_Connection</span>
        </div>
        <div className="flex items-center gap-8 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <span className="hover:text-slate-900 cursor-pointer transition-colors">Privacy_Protocol</span>
          <span className="hover:text-slate-900 cursor-pointer transition-colors">System_Status</span>
        </div>
      </footer>
    </div>
  );
}
