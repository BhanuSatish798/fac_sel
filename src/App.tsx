import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Landing from "./components/Landing";
import StudentLogin from "./components/StudentLogin";
import AdminLogin from "./components/AdminLogin";
import Dashboard from "./components/Dashboard";
import Admin from "./components/Admin";
import { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "sonner";

import { OperationType, handleFirestoreError } from "./lib/utils";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStudent, setIsStudent] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setUser(user);
      if (user && user.uid) {
        // Check if user is admin or student
        try {
          // Optimization: If it's the default admin email, we can skip the Firestore check for initial UI
          const isDefaultAdmin = user.email === "24095a0506@rgmcet.edu.in";
          if (isDefaultAdmin) {
            setIsAdmin(true);
            setIsStudent(false);
            setLoading(false);
            // We still try to fetch the doc to see if there's more info, but we don't block
          }

          // Use a small delay to allow Firestore to propagate if it was just created
          // This is especially useful for anonymous student logins
          const userDocRef = doc(db, "users", user.uid);
          let userDoc;
          try {
            userDoc = await getDoc(userDocRef);
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
            return;
          }
          
          if (userDoc.exists()) {
            const role = userDoc.data()?.role;
            setIsAdmin(role === "admin" || isDefaultAdmin);
            setIsStudent(role === "student");
          } else if (isDefaultAdmin) {
            // Document doesn't exist yet, but we know they are admin by email
            setIsAdmin(true);
            setIsStudent(false);
          } else {
            // Document doesn't exist and not default admin
            // This might be a race condition, we'll try one more time after a short delay
            setTimeout(async () => {
              try {
                const retryDoc = await getDoc(userDocRef);
                if (retryDoc.exists()) {
                  const role = retryDoc.data()?.role;
                  setIsAdmin(role === "admin" || isDefaultAdmin);
                  setIsStudent(role === "student");
                }
              } catch (err) {
                // Silent fail on retry to avoid double toast
                console.error("Retry fetch user role failed", err);
              }
            }, 1000);
            
            setIsAdmin(false);
            setIsStudent(false);
          }
        } catch (err) {
          console.error("Error fetching user role", err);
          // Fallback to email check
          setIsAdmin(user.email === "24095a0506@rgmcet.edu.in");
          setIsStudent(false);
        }
      } else {
        setIsAdmin(false);
        setIsStudent(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#7c3aed]"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/student/login" element={<StudentLogin />} />
          <Route path="/admin/login" element={
            !isAdmin ? <AdminLogin /> : <Navigate to="/admin" />
          } />
          <Route path="/dashboard" element={isStudent ? <Dashboard /> : <Navigate to="/student/login" />} />
          <Route path="/admin" element={isAdmin ? <Admin /> : <Navigate to="/admin/login" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
      <Toaster position="top-right" richColors />
    </ErrorBoundary>
  );
}
