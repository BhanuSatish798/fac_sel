import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDoc, 
  updateDoc, 
  runTransaction
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogOut, User, CheckCircle, AlertCircle, Shield, BarChart3, Clock, Download } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { OperationType, handleFirestoreError, cn } from "../lib/utils";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface Student {
  registrationNumber: string;
  name: string;
  branch: string;
  year: string;
  phoneNumber: string;
  selections: Record<string, string>;
  isSubmitted: boolean;
  submittedAt?: string;
  group: string;
}

interface Subject {
  id: string;
  name: string;
}

interface Faculty {
  id: string;
  name: string;
  subjectId: string;
  studentCount: number;
  capacity?: number;
  group: string;
}

export default function Dashboard() {
  const [student, setStudent] = useState<Student | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSelectionEnabled, setIsSelectionEnabled] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let unsubStudent: (() => void) | null = null;
    let unsubSubjects: (() => void) | null = null;
    let unsubFaculty: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (!user || !user.uid) {
        if (unsubStudent) unsubStudent();
        if (unsubSubjects) unsubSubjects();
        if (unsubFaculty) unsubFaculty();
        if (unsubSettings) unsubSettings();
        navigate("/");
        return;
      }

      // Fetch student details
      try {
        const userDocRef = doc(db, "users", user.uid);
        let userDoc = await getDoc(userDocRef);
        
        // Retry once if doc doesn't exist (race condition)
        if (!userDoc.exists()) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          userDoc = await getDoc(userDocRef);
        }

        let regNo = userDoc.data()?.registrationNumber;

        if (!regNo) {
          toast.error("Account not linked to a student record.");
          setLoading(false);
          return;
        }

        const studentRef = doc(db, "students", regNo);
        unsubStudent = onSnapshot(studentRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data() as Student;
            setStudent(data);
            setSelections(data.selections || {});
          } else {
            toast.error("Student record not found.");
          }
          setLoading(false);
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, `students/${regNo}`);
          }
        });

        // Fetch subjects and faculty only after auth
        unsubSubjects = onSnapshot(collection(db, "subjects"), (snap) => {
          setSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, "subjects");
          }
        });

        unsubFaculty = onSnapshot(collection(db, "faculty"), (snap) => {
          setFaculty(snap.docs.map(d => ({ id: d.id, ...d.data() } as Faculty)));
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, "faculty");
          }
        });

        unsubSettings = onSnapshot(doc(db, "settings", "system"), (snapshot) => {
          if (snapshot.exists()) {
            setIsSelectionEnabled(snapshot.data().isSelectionEnabled);
          }
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, "settings/system");
          }
        });
      } catch (err) {
        console.error("Error in Dashboard auth listener:", err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubStudent) unsubStudent();
      if (unsubSubjects) unsubSubjects();
      if (unsubFaculty) unsubFaculty();
    };
  }, [navigate]);

  const handleSelect = (subjectId: string, facultyId: string) => {
    if (student?.isSubmitted || !isSelectionEnabled) return;
    setSelections(prev => ({ ...prev, [subjectId]: facultyId }));
  };

  const handleSubmit = async () => {
    if (!student || !isSelectionEnabled) return;
    setSubmitting(true);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. ALL READS FIRST
        const studentRef = doc(db, "students", student.registrationNumber);
        const studentSnap = await transaction.get(studentRef);
        
        if (studentSnap.data()?.isSubmitted) {
          throw new Error("Already submitted.");
        }

        // Validate all subjects are selected
        if (Object.keys(selections).length < subjects.length) {
          throw new Error("Please select faculty for all subjects.");
        }

        // Read all faculty data
        const processedFaculty: { ref: any, snap: any, currentCount: number }[] = [];
        for (const facultyId of Object.values(selections) as string[]) {
          const facultyRef = doc(db, "faculty", facultyId);
          const facultySnap = await transaction.get(facultyRef);
          const facultyData = facultySnap.data();
          const currentCount = facultyData?.studentCount || 0;
          const capacity = facultyData?.capacity || 70;

          if (currentCount >= capacity) {
            throw new Error(`Faculty ${facultyData?.name} is full (${currentCount}/${capacity} seats).`);
          }
          
          processedFaculty.push({ ref: facultyRef, snap: facultySnap, currentCount });
        }

        // 2. ALL WRITES SECOND
        for (const f of processedFaculty) {
          transaction.update(f.ref, { studentCount: f.currentCount + 1 });
        }

        transaction.update(studentRef, {
          selections,
          isSubmitted: true,
          submittedAt: new Date().toISOString()
        });
      });

      const selectionDetails = Object.entries(selections).reduce((acc, [subId, facId]) => {
        const subName = subjects.find(s => s.id === subId)?.name || subId;
        const facName = faculty.find(f => f.id === facId)?.name || facId;
        acc[subName] = facName;
        return acc;
      }, {} as Record<string, string>);

      const studentEmail = `${student.registrationNumber.toLowerCase()}@rgmcet.edu.in`;

      try {
        const emailResponse = await fetch("/api/email/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentEmail,
            studentName: student.name,
            selections: selectionDetails
          })
        });
        
        const emailResult = await emailResponse.json();
        if (!emailResponse.ok) {
          console.error("Email failed:", emailResult.error);
          let errorMsg = "Selections saved, but confirmation email failed to send.";
          if (emailResult.debug) {
            errorMsg += ` (User: ${emailResult.debug.user}, Pass Length: ${emailResult.debug.passLength}). ${emailResult.debug.tip}`;
          }
          toast.warning(errorMsg, { duration: 10000 });
        } else if (emailResult.message?.includes("mocked")) {
          console.warn("Email mocked:", emailResult.debug);
          toast.warning(`Selections saved, but email service is not configured. (User: ${emailResult.debug.user}, Pass Length: ${emailResult.debug.passLength}). ${emailResult.debug.tip}`, { duration: 10000 });
        } else {
          toast.success("Selections submitted successfully! A confirmation email has been sent.");
        }
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError);
        toast.warning("Selections saved, but email service is currently unavailable.");
      }
      setShowConfirm(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadReceipt = () => {
    if (!student) return;

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text("RGMCET Faculty Selection Receipt", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
    
    // Student Details Section
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(14, 35, 196, 35);
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.text("Student Information", 14, 45);
    
    doc.setFontSize(11);
    doc.text(`Name:`, 14, 55);
    doc.text(student.name, 60, 55);
    
    doc.text(`Registration Number:`, 14, 62);
    doc.text(student.registrationNumber, 60, 62);
    
    doc.text(`Branch:`, 14, 69);
    doc.text(student.branch, 60, 69);
    
    doc.text(`Year:`, 14, 76);
    doc.text(student.year, 60, 76);
    
    // Selections Table
    const tableColumn = ["Subject", "Selected Faculty"];
    const tableRows = subjects.map(subject => {
      const facultyId = student.selections[subject.id];
      const selectedFaculty = faculty.find(f => f.id === facultyId);
      return [subject.name, selectedFaculty?.name || "N/A"];
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 85,
      theme: 'grid',
      headStyles: { fillColor: [124, 58, 237], fontStyle: 'bold' }, // #7c3aed
      styles: { fontSize: 10, cellPadding: 6 },
      alternateRowStyles: { fillColor: [248, 250, 252] } // slate-50
    });
    
    // Footer
    const finalY = (doc as any).lastAutoTable.finalY || 150;
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("This is a computer-generated receipt. No signature is required.", 14, finalY + 20);
    doc.text(`Session ID: ${auth.currentUser?.uid.slice(0, 12).toUpperCase()}`, 14, finalY + 26);
    doc.text("© 2026 RGMCET_SYS • Academic_Node_Alpha", 14, finalY + 32);

    doc.save(`Selection_Receipt_${student.registrationNumber}.pdf`);
    toast.success("Receipt downloaded successfully.");
  };

  if (loading) return (
    <div className="min-h-screen bg-transparent flex items-center justify-center font-mono text-xs font-bold uppercase tracking-[0.3em] text-slate-300 animate-pulse">
      Initializing_Secure_Session...
    </div>
  );

  if (!student) return null;

  return (
    <div className="min-h-screen bg-transparent text-[#0f172a] p-6 relative overflow-hidden flex flex-col">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#7c3aed]/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />

      <div className="max-w-7xl mx-auto w-full space-y-8 relative z-10">
        {/* Header */}
        <header className="glass-card p-6 rounded-[32px] flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-6">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                <User size={24} className="text-[#7c3aed]" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-black tracking-tight">{student?.name}</h2>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${student?.group === 'A' ? 'bg-blue-500/10 text-blue-600' : 'bg-purple-500/10 text-purple-600'}`}>
                    Group_{student?.group}
                  </span>
                </div>
                <p className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">{student?.registrationNumber} • {student?.branch}</p>
              </div>
            </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end px-6 border-r border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">System_Status</span>
              <span className="text-[10px] font-mono font-bold text-green-600 uppercase tracking-tighter">Secure_Connection</span>
            </div>
            <button 
              onClick={() => auth.signOut()}
              className="p-3 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-2xl transition-all"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Status Banner */}
        {!isSelectionEnabled && !student?.isSubmitted && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-8 rounded-[40px] border-red-500/20 bg-red-50/50 flex flex-col md:flex-row items-center gap-8 text-center md:text-left relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Shield size={120} className="text-red-500" />
            </div>
            <div className="w-16 h-16 bg-red-500/10 rounded-3xl flex items-center justify-center shrink-0">
              <Clock size={32} className="text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-red-600 mb-2 tracking-tight">Selection_Process_Offline</h3>
              <p className="text-slate-500 leading-relaxed">The faculty selection portal is currently disabled by the administration. Please wait for the official announcement to begin your selection.</p>
            </div>
            <div className="px-6 py-3 bg-red-500/10 rounded-2xl text-[10px] font-mono font-bold text-red-600 uppercase tracking-widest border border-red-500/20">
              Status: Locked
            </div>
          </motion.div>
        )}

        {student?.isSubmitted && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-8 rounded-[40px] border-[#7c3aed]/20 bg-[#7c3aed]/5 space-y-8"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-[#7c3aed]/20 rounded-3xl flex items-center justify-center">
                  <CheckCircle size={32} className="text-[#7c3aed]" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-[#7c3aed] tracking-tight">Selection_Confirmed</h3>
                  <p className="text-sm font-medium text-slate-600">Your faculty allocation request has been processed and encrypted.</p>
                </div>
              </div>
              <button 
                onClick={downloadReceipt}
                className="w-full md:w-auto px-8 py-4 bg-[#7c3aed] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-[#6d28d9] transition-all shadow-lg shadow-[#7c3aed]/20 hover:scale-105 active:scale-95"
              >
                <Download size={18} />
                Download_Receipt
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects.map((subject) => {
                const facultyId = student.selections[subject.id];
                const selectedFaculty = faculty.find(f => f.id === facultyId);
                return (
                  <div key={subject.id} className="p-6 bg-white/50 rounded-3xl border border-[#7c3aed]/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#7c3aed] mb-2">{subject.name}</p>
                    <p className="text-lg font-black text-slate-900">{selectedFaculty?.name || "N/A"}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Subjects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((subject, index) => {
            const selectedFacultyId = selections[subject.id];
            const selectedFaculty = faculty.find(f => f.id === selectedFacultyId);
            const isCompleted = !!selectedFacultyId;

            return (
              <div key={subject.id} className={`glass-card rounded-[32px] overflow-hidden flex flex-col transition-all duration-500 ${isCompleted ? "border-[#7c3aed]/30" : ""}`}>
                <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-3xl font-serif italic text-slate-200">{(index + 1).toString().padStart(2, '0')}</span>
                    {isCompleted && <CheckCircle size={20} className="text-[#7c3aed]" />}
                  </div>
                  <h3 className="text-xl font-black tracking-tight mb-1">{subject.name}</h3>
                  <p className="text-[9px] font-mono font-black uppercase tracking-widest text-slate-500">ID: {subject.id}</p>
                </div>

                <div className="p-6 space-y-3 flex-1">
                  {faculty.filter(f => f.subjectId === subject.id && f.group === student.group).map(f => {
                    const isSelected = selections[subject.id] === f.id;
                    const isFull = f.studentCount >= 70;

                    return (
                      <button
                        key={f.id}
                        disabled={student?.isSubmitted || (isFull && !isSelected) || !isSelectionEnabled}
                        onClick={() => handleSelect(subject.id, f.id)}
                        className={`w-full p-4 rounded-2xl border transition-all text-left group relative overflow-hidden ${
                          isSelected 
                            ? "bg-[#7c3aed] border-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/20" 
                            : "bg-slate-50 border-slate-100 hover:border-slate-200 text-slate-600 hover:text-slate-900"
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        <div className="flex justify-between items-center relative z-10">
                          <div>
                            <p className="font-black text-sm uppercase tracking-tight">{f.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="h-1 w-12 bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all ${isSelected ? "bg-white" : "bg-[#7c3aed]"}`}
                                  style={{ width: `${(f.studentCount / 70) * 100}%` }}
                                />
                              </div>
                              <span className="text-[9px] font-mono opacity-40">{f.studentCount}/70</span>
                            </div>
                          </div>
                          {isSelected && <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center"><CheckCircle size={14} /></div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit Section */}
        {!student?.isSubmitted && (
          <div className="pt-12 pb-24 flex flex-col items-center gap-8">
            <div className="flex items-center gap-4 text-slate-300">
              <div className="h-px w-12 bg-slate-100" />
              <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Final_Execution</span>
              <div className="h-px w-12 bg-slate-100" />
            </div>
            
            <button
              onClick={() => setShowConfirm(true)}
              disabled={Object.keys(selections).length < subjects.length || !isSelectionEnabled}
              className="group relative px-16 py-6 bg-slate-900 text-white rounded-full font-black uppercase tracking-[0.2em] hover:bg-[#7c3aed] transition-all shadow-2xl disabled:opacity-20 disabled:cursor-not-allowed overflow-hidden"
            >
              <span className="relative z-10">Execute_Submission</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />
            </button>
            
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
              {Object.keys(selections).length}/{subjects.length} Modules_Selected
            </p>
          </div>
        )}

        {/* Footer */}
        <footer className="py-12 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300">
          <div className="flex items-center gap-4">
            <span>© 2026 RGMCET_SYS</span>
            <div className="w-1 h-1 rounded-full bg-slate-200" />
            <span>Session_ID: {auth.currentUser?.uid.slice(0, 8)}</span>
          </div>
          <div className="flex items-center gap-8">
            <span>Latency: 12ms</span>
            <span>V2.0.4_STABLE</span>
          </div>
        </footer>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-card p-12 rounded-[48px] max-w-md w-full text-center relative accent-glow"
            >
              <div className="w-20 h-20 bg-[#7c3aed]/20 rounded-[32px] flex items-center justify-center mx-auto mb-8">
                <AlertCircle size={40} className="text-[#7c3aed]" />
              </div>
              <h3 className="text-3xl font-bold tracking-tight mb-4">Confirm_Action</h3>
              <p className="text-slate-500 mb-12 leading-relaxed">
                Are you sure you want to finalize your selections? This action will encrypt your data and close the submission window.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 px-8 py-5 rounded-3xl font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all"
                >
                  Abort
                </button>
                <button 
                  onClick={handleSubmit}
                  className="flex-1 px-8 py-5 rounded-3xl font-bold uppercase tracking-widest bg-[#7c3aed] text-white hover:bg-[#6d28d9] transition-all shadow-lg shadow-[#7c3aed]/20"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
