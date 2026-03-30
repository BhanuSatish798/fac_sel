import React, { useState } from "react";
import { auth, db } from "../firebase";
import { signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import bcrypt from "bcryptjs";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { motion } from "motion/react";
import { OperationType, handleFirestoreError } from "../lib/utils";

export default function StudentLogin() {
  const [regNo, setRegNo] = useState("");
  const [dob, setDob] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    // Check if user is already signed in
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && !user.isAnonymous) {
        // If signed in with Google (admin), sign out to allow student login
        auth.signOut();
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const normalizedRegNo = regNo.trim().toUpperCase();
      // 1. Check if student exists in Firestore
      const studentRef = doc(db, "students", normalizedRegNo);
      let studentSnap;
      try {
        studentSnap = await getDoc(studentRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `students/${normalizedRegNo}`);
        return;
      }

      if (!studentSnap.exists()) {
        toast.error(`Student record not found for ${normalizedRegNo}. Please ensure you have seeded the data in the Admin Panel.`);
        return;
      }

      const studentData = studentSnap.data();
      
      // 2. Verify DOB hash
      // Convert input DOB (YYYY-MM-DD from input type="date") to DD-MM-YYYY
      const [y, m, d] = dob.split("-");
      
      // Try both padded and non-padded versions to be safe
      const paddedDob = `${d}-${m}-${y}`;
      const unpaddedDob = `${parseInt(d)}-${parseInt(m)}-${y}`;
      
      console.log(`Login attempt for ${regNo}: Trying ${paddedDob} and ${unpaddedDob}`);
      
      if (!studentData.dob) {
        toast.error("Student record is incomplete (missing DOB). Please contact admin.");
        return;
      }

      try {
        const isPaddedValid = bcrypt.compareSync(paddedDob, studentData.dob);
        const isUnpaddedValid = bcrypt.compareSync(unpaddedDob, studentData.dob);
        
        if (!isPaddedValid && !isUnpaddedValid) {
          toast.error("Invalid Date of Birth.");
          return;
        }
      } catch (bcryptError) {
        console.error("BCrypt error:", bcryptError);
        toast.error("Error verifying Date of Birth. Please try again.");
        return;
      }

      // 3. Sign in anonymously
      let userCredential;
      try {
        userCredential = await signInAnonymously(auth);
      } catch (error: any) {
        console.error("Auth Error Details:", error);
        // Status 400 or admin-restricted-operation usually means Anonymous Auth is disabled
        if (error.code === "auth/admin-restricted-operation" || error.code === "auth/operation-not-allowed" || error.message?.includes("400")) {
          toast.error(
            <div className="flex flex-col gap-2">
              <p className="font-bold">Authentication Provider Disabled</p>
              <p className="text-xs">Anonymous Authentication must be enabled in your Firebase Console.</p>
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
          return;
        }
        throw error;
      }
      
      const user = userCredential.user;

      // 4. Link the UID to the student record in the users collection
      try {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          registrationNumber: normalizedRegNo,
          role: "student",
          lastLogin: new Date().toISOString()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        return;
      }

      // 5. Update student record with the current UID if it's different or missing
      try {
        if (studentData.uid !== user.uid) {
          await updateDoc(studentRef, {
            uid: user.uid
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `students/${normalizedRegNo}`);
        return;
      }

      toast.success("Login successful!");
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Full Firebase Error:", error);
      toast.error(error.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-[#0f172a] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#7c3aed]/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/5 blur-[120px] rounded-full" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full glass-card p-12 rounded-[40px] relative z-10 accent-glow"
      >
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors mb-12 group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Back_to_Home</span>
        </button>

        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight serif-italic text-slate-900 mb-2">Student_Login</h1>
          <p className="text-sm font-medium text-slate-600">Initialize your session with registration credentials.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 ml-1">Registration_No</label>
            <input
              type="text"
              required
              placeholder="e.g. 21091A0501"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value.toUpperCase())}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus:outline-none focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed] transition-all placeholder:text-slate-300"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 ml-1">Date_of_Birth</label>
            <input
              type="date"
              required
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus:outline-none focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed] transition-all placeholder:text-slate-300"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#7c3aed] text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-[#6d28d9] transition-all shadow-lg shadow-[#7c3aed]/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Authenticating..." : "Initialize_Session"}
          </button>
        </form>

        <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between items-center font-mono text-[8px] font-bold uppercase tracking-widest text-slate-300">
          <span>© 2026 RGMCET_SYS</span>
          <span>PID: {auth.app.options.projectId?.slice(0, 8)}</span>
        </div>
      </motion.div>
    </div>
  );
}
