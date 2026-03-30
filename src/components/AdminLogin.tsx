import { useState } from "react";
import { auth, db } from "../firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { OperationType, handleFirestoreError } from "../lib/utils";

export default function AdminLogin() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if this is the admin
      if (user.email === "24095a0506@rgmcet.edu.in") {
        // Ensure admin record exists in users collection
        try {
          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: user.email,
            role: "admin"
          }, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
          return;
        }
        
        toast.success("Admin Login successful!");
        navigate("/admin");
      } else {
        // Check if user is an admin in Firestore
        const userRef = doc(db, "users", user.uid);
        let userSnap;
        try {
          userSnap = await getDoc(userRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
          return;
        }
        
        if (userSnap.exists() && userSnap.data().role === "admin") {
          toast.success("Admin Login successful!");
          navigate("/admin");
        } else {
          toast.error("Access denied. This portal is for administrators only.");
          await auth.signOut();
        }
      }
    } catch (error: any) {
      console.error("Full Firebase Error:", error);
      if (error.code === "auth/admin-restricted-operation" || error.code === "auth/operation-not-allowed") {
        toast.error(
          <div className="flex flex-col gap-2">
            <p className="font-bold">Google Auth Restricted</p>
            <p className="text-xs">Google Sign-in must be enabled in your Firebase Console.</p>
            <a 
              href={`https://console.firebase.google.com/project/${auth.app.options.projectId}/authentication/providers`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline text-[10px] font-bold"
            >
              OPEN_FIREBASE_CONSOLE
            </a>
          </div>,
          { duration: 10000 }
        );
      } else {
        toast.error(error.message || "Admin Login failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-[#0f172a] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#7c3aed]/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 blur-[120px] rounded-full" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full glass-card p-12 rounded-[40px] relative z-10"
      >
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors mb-12 group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Back_to_Home</span>
        </button>

        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight serif-italic text-slate-900 mb-2">Admin_Auth</h1>
          <p className="text-sm font-medium text-slate-600">Elevated access for system administrators.</p>
        </div>

        <div className="space-y-8">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-4 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 brightness-200" />
            {loading ? "Verifying..." : "Google_SSO_Login"}
          </button>
          
          <div className="p-6 border border-slate-200 rounded-2xl bg-slate-50">
            <p className="text-[10px] font-mono font-black uppercase tracking-widest text-center leading-relaxed text-slate-700">
              Warning: Unauthorized access attempts are logged and reported to the security department.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between items-center font-mono text-[8px] font-bold uppercase tracking-widest text-slate-300">
          <span>© 2026 RGMCET_SYS</span>
          <span>PID: {auth.app.options.projectId?.slice(0, 8)}</span>
        </div>
      </motion.div>
    </div>
  );
}
