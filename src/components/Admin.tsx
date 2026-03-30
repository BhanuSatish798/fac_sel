import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDoc,
  setDoc,
  updateDoc, 
  deleteDoc, 
  writeBatch,
  getDocs,
  query,
  where
} from "firebase/firestore";
import { toast } from "sonner";
import { Download, RotateCcw, Users, BarChart3, ShieldCheck, LogOut, User, CheckCircle, AlertCircle, Shield, Clock, Search, Trash2, ShieldAlert } from "lucide-react";
import bcrypt from "bcryptjs";
import { useNavigate } from "react-router-dom";
import { OperationType, handleFirestoreError } from "../lib/utils";
import { studentData } from "../data/students";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from 'xlsx';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ChevronDown } from "lucide-react";

interface Student {
  registrationNumber: string;
  name: string;
  branch: string;
  year: string;
  selections: Record<string, string>;
  isSubmitted: boolean;
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

export default function Admin() {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showClearFacultyConfirm, setShowClearFacultyConfirm] = useState(false);
  const [showClearStudentsConfirm, setShowClearStudentsConfirm] = useState(false);
  const [isSelectionEnabled, setIsSelectionEnabled] = useState(true);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingFaculty, setUploadingFaculty] = useState(false);
  const [activeReportGroup, setActiveReportGroup] = useState<'A' | 'B' | null>(null);
  const navigate = useNavigate();

  const filteredStudents = students.filter(s => 
    s.registrationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const dataBuffer = evt.target?.result;
        const wb = XLSX.read(dataBuffer, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          toast.error("The file is empty or could not be read.");
          return;
        }

        // Debug: Log keys of the first row to help troubleshoot
        console.log("Detected headers in first row:", Object.keys(data[0] as object));

        setUploading(true);
        const toastId = toast.loading(`Processing ${data.length} records...`);

        let batch = writeBatch(db);
        let count = 0;
        let totalProcessed = 0;
        let skippedCount = 0;

        // Pre-process and sort students by registration number to determine groups
        const validStudents = (data as any[]).map(row => {
          const normalizedRow: any = {};
          Object.keys(row).forEach(key => {
            const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            normalizedRow[normalizedKey] = row[key];
          });

          const regNo = String(normalizedRow['regno'] || normalizedRow['registrationnumber'] || normalizedRow['id'] || normalizedRow['rollno'] || normalizedRow['htno'] || "").trim();
          const name = String(normalizedRow['name'] || normalizedRow['studentname'] || normalizedRow['fullname'] || normalizedRow['entityname'] || "").trim();
          const dob = String(normalizedRow['dob'] || normalizedRow['dateofbirth'] || normalizedRow['birthdate'] || "").trim();
          const branch = String(normalizedRow['branch'] || normalizedRow['department'] || normalizedRow['dept'] || normalizedRow['stream'] || "N/A").trim();

          return { regNo, name, dob, branch, isValid: !!(regNo && name && dob) };
        }).filter(s => s.isValid);

        validStudents.sort((a, b) => a.regNo.localeCompare(b.regNo));

        for (let i = 0; i < validStudents.length; i++) {
          const s = validStudents[i];
          const hashedDob = bcrypt.hashSync(s.dob, 10);
          const studentRef = doc(db, "students", s.regNo);
          
          batch.set(studentRef, {
            registrationNumber: s.regNo,
            name: s.name,
            branch: s.branch,
            year: "3rd",
            phoneNumber: "",
            dob: hashedDob,
            selections: {},
            isSubmitted: false,
            group: i < validStudents.length / 2 ? "A" : "B"
          }, { merge: true });
          
          count++;
          totalProcessed++;

          if (count >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }

        if (count > 0) {
          await batch.commit();
        }

        skippedCount = data.length - totalProcessed;

        if (totalProcessed === 0) {
          toast.error(`No valid students found. Checked ${data.length} rows. Please ensure your columns are named 'Reg No', 'Name', and 'DOB'.`, { id: toastId, duration: 5000 });
        } else {
          toast.success(`Successfully uploaded ${totalProcessed} students!${skippedCount > 0 ? ` (Skipped ${skippedCount} invalid rows)` : ""}`, { id: toastId });
        }
      } catch (err: any) {
        console.error("Upload error:", err);
        toast.error("Upload failed: " + err.message);
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFacultyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const dataBuffer = evt.target?.result;
        const wb = XLSX.read(dataBuffer, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          toast.error("The file is empty or could not be read.");
          return;
        }

        setUploadingFaculty(true);
        const toastId = toast.loading(`Processing ${data.length} faculty records...`);

        let batch = writeBatch(db);
        let count = 0;
        let totalProcessed = 0;
        let skippedCount = 0;

        // Get current subjects to match names
        const subjectsSnap = await getDocs(collection(db, "subjects"));
        const currentSubjects = subjectsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subject));

        for (const row of data as any[]) {
          const normalizedRow: any = {};
          Object.keys(row).forEach(key => {
            const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            normalizedRow[normalizedKey] = row[key];
          });

          // Log headers on first row to help debugging if needed
          if (totalProcessed === 0 && skippedCount === 0) {
            console.log("Detected normalized headers:", Object.keys(normalizedRow));
          }

          const name = normalizedRow['name'] || normalizedRow['facultyname'] || normalizedRow['professor'] || normalizedRow['lecturer'] || normalizedRow['faculty'];
          const subjectName = normalizedRow['subject'] || normalizedRow['subjectname'] || normalizedRow['course'] || normalizedRow['subjectid'];
          const capacity = parseInt(normalizedRow['capacity'] || normalizedRow['seats'] || normalizedRow['limit'] || "70");
          const group = String(normalizedRow['group'] || normalizedRow['batch'] || "A").toUpperCase().trim();

          if (!name || !subjectName) {
            skippedCount++;
            continue;
          }

          // More robust subject matching:
          // 1. Exact match (case-insensitive, trimmed)
          // 2. Match after removing all non-alphanumeric characters
          const cleanSubjectName = String(subjectName).toLowerCase().replace(/[^a-z0-9]/g, '');
          const subject = currentSubjects.find(s => {
            const sName = s.name.toLowerCase().trim();
            const sCleanName = sName.replace(/[^a-z0-9]/g, '');
            return sName === String(subjectName).toLowerCase().trim() || sCleanName === cleanSubjectName;
          });
          
          if (!subject) {
            console.warn(`Subject not found in database: "${subjectName}" (Cleaned: "${cleanSubjectName}")`);
            skippedCount++;
            continue;
          }

          const facultyId = `${subject.id}_${String(name).replace(/[^a-zA-Z0-9]/g, '').substring(0, 10)}_${Date.now().toString().slice(-4)}`;
          const facultyRef = doc(db, "faculty", facultyId);
          
          batch.set(facultyRef, {
            id: facultyId,
            name: String(name).trim(),
            subjectId: subject.id,
            studentCount: 0,
            capacity: capacity,
            group: group === "B" ? "B" : "A"
          });
          
          count++;
          totalProcessed++;

          if (count >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }

        if (count > 0) {
          await batch.commit();
        }

        if (totalProcessed === 0) {
          const availableSubjects = currentSubjects.map(s => `"${s.name}"`).join(", ");
          toast.error(`No valid faculty found. Checked ${data.length} rows. Ensure columns like 'Faculty Name' and 'Subject' exist. Subjects in your file must match one of these: ${availableSubjects}`, { id: toastId, duration: 8000 });
        } else {
          toast.success(`Successfully uploaded ${totalProcessed} faculty!${skippedCount > 0 ? ` (Skipped ${skippedCount} invalid rows)` : ""}`, { id: toastId });
        }
      } catch (err: any) {
        console.error("Faculty upload error:", err);
        toast.error("Upload failed: " + err.message);
      } finally {
        setUploadingFaculty(false);
        e.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  useEffect(() => {
    let unsubStudents: (() => void) | null = null;
    let unsubSubjects: (() => void) | null = null;
    let unsubFaculty: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        if (unsubStudents) unsubStudents();
        if (unsubSubjects) unsubSubjects();
        if (unsubFaculty) unsubFaculty();
        if (unsubSettings) unsubSettings();
        navigate("/admin/login");
        return;
      }

      // Check if user is admin
      try {
        const userDocRef = doc(db, "users", user.uid);
        let userDoc;
        try {
          userDoc = await getDoc(userDocRef);
        } catch (err) {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
          }
          return;
        }
        
        // Retry once if doc doesn't exist (race condition)
        if (!userDoc.exists()) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            userDoc = await getDoc(userDocRef);
          } catch (err) {
            console.error("Retry fetch admin doc failed", err);
          }
        }

        const isDefaultAdmin = user.email === "24095a0506@rgmcet.edu.in";
        if (userDoc?.data()?.role !== "admin" && !isDefaultAdmin) {
          toast.error("Access denied.");
          navigate("/");
          return;
        }

        unsubStudents = onSnapshot(collection(db, "students"), (snap) => {
          setStudents(snap.docs.map(d => d.data() as Student));
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, "students");
          }
        });
        
        unsubSubjects = onSnapshot(collection(db, "subjects"), (snap) => {
          setSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, "subjects");
          }
        });
        
        unsubFaculty = onSnapshot(collection(db, "faculty"), (snap) => {
          setFaculty(snap.docs.map(d => ({ id: d.id, ...d.data() } as Faculty)));
          setLoading(false);
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, "faculty");
          }
        });

        unsubSettings = onSnapshot(doc(db, "settings", "system"), (snapshot) => {
          if (snapshot.exists()) {
            setIsSelectionEnabled(snapshot.data().isSelectionEnabled);
          } else {
            // Initialize if not exists
            setDoc(doc(db, "settings", "system"), { isSelectionEnabled: true });
          }
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, "settings/system");
          }
        });
      } catch (err) {
        console.error("Error in Admin auth listener:", err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubStudents) unsubStudents();
      if (unsubSubjects) unsubSubjects();
      if (unsubFaculty) unsubFaculty();
    };
  }, [navigate]);

  const exportCSV = () => {
    const headers = ["Reg No", "Name", "Branch", "Year", ...subjects.map(s => s.name)];
    const rows = students.map(s => [
      s.registrationNumber,
      s.name,
      s.branch,
      s.year,
      ...subjects.map(sub => {
        const facId = s.selections?.[sub.id];
        return faculty.find(f => f.id === facId)?.name || "N/A";
      })
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "student_selections.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadReport = (group: 'A' | 'B', format: 'excel' | 'pdf') => {
    const groupFaculty = faculty.filter(f => f.group === group);
    const groupStudents = students.filter(s => s.group === group && s.isSubmitted);

    if (groupFaculty.length === 0) {
      toast.error(`No faculty found for Group ${group}`);
      return;
    }

    const reportData: any[] = [];

    groupFaculty.forEach(f => {
      const selectedStudents = groupStudents.filter(s => 
        Object.values(s.selections).includes(f.id)
      );

      const subject = subjects.find(sub => sub.id === f.subjectId)?.name || "Unknown Subject";

      if (selectedStudents.length === 0) {
        reportData.push({
          "Faculty Name": f.name,
          "Subject": subject,
          "Reg No": "N/A",
          "Student Name": "No students selected",
          "Branch": "N/A"
        });
      } else {
        selectedStudents.forEach(s => {
          reportData.push({
            "Faculty Name": f.name,
            "Subject": subject,
            "Reg No": s.registrationNumber,
            "Student Name": s.name,
            "Branch": s.branch
          });
        });
      }
    });

    if (format === 'excel') {
      const ws = XLSX.utils.json_to_sheet(reportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Group ${group} Selections`);
      XLSX.writeFile(wb, `Faculty_Selections_Group_${group}.xlsx`);
    } else {
      const doc = new jsPDF();
      doc.text(`Faculty Selections Report - Group ${group}`, 14, 15);
      
      const tableColumn = ["Faculty Name", "Subject", "Reg No", "Student Name", "Branch"];
      const tableRows = reportData.map(item => [
        item["Faculty Name"],
        item["Subject"],
        item["Reg No"],
        item["Student Name"],
        item["Branch"]
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [139, 92, 246] } // Violet
      });

      doc.save(`Faculty_Selections_Group_${group}.pdf`);
    }
  };

  const toggleSelection = async () => {
    setUpdatingSettings(true);
    try {
      await setDoc(doc(db, "settings", "system"), { 
        isSelectionEnabled: !isSelectionEnabled 
      }, { merge: true });
      toast.success(`Selection process ${!isSelectionEnabled ? 'enabled' : 'disabled'}.`);
    } catch (e: any) {
      toast.error("Failed to update settings: " + e.message);
    } finally {
      setUpdatingSettings(false);
    }
  };

  const resetAll = async () => {
    setShowResetConfirm(false);
    const toastId = toast.loading("Resetting all selections...");
    try {
      let batch = writeBatch(db);
      let count = 0;
      
      // Reset students
      for (const s of students) {
        const ref = doc(db, "students", s.registrationNumber);
        batch.update(ref, { selections: {}, isSubmitted: false });
        count++;
        if (count >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      // Reset faculty counts
      for (const f of faculty) {
        const ref = doc(db, "faculty", f.id);
        batch.update(ref, { studentCount: 0 });
        count++;
        if (count >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }
      toast.success("All selections reset successfully.", { id: toastId });
    } catch (e: any) {
      toast.error(e.message, { id: toastId });
    }
  };

  const clearAllFaculty = async () => {
    setShowClearFacultyConfirm(false);
    const toastId = toast.loading("Clearing all faculty records...");
    
    try {
      if (faculty.length === 0) {
        toast.error("No faculty records found to clear.", { id: toastId });
        return;
      }

      let batch = writeBatch(db);
      let count = 0;
      
      for (const f of faculty) {
        batch.delete(doc(db, "faculty", f.id));
        count++;
        if (count >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }
      toast.success("All faculty records cleared.", { id: toastId });
    } catch (e: any) {
      toast.error("Failed to clear faculty: " + e.message, { id: toastId });
    }
  };

  const clearAllStudents = async () => {
    setShowClearStudentsConfirm(false);
    const toastId = toast.loading("Clearing all student records...");
    
    try {
      if (students.length === 0) {
        toast.error("No student records found to clear.", { id: toastId });
        return;
      }

      let batch = writeBatch(db);
      let count = 0;
      
      for (const s of students) {
        batch.delete(doc(db, "students", s.registrationNumber));
        count++;
        if (count >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }
      toast.success("All student records cleared.", { id: toastId });
    } catch (e: any) {
      toast.error("Failed to clear students: " + e.message, { id: toastId });
    }
  };

  const seedData = async () => {
    if (seeding) return;
    setSeeding(true);
    const toastId = toast.loading("Seeding database... This may take a moment due to secure hashing.");
    
    try {
      const batch = writeBatch(db);

      // Seed Subjects
      const subjectsData = [
        { id: "S1", name: "Machine Learning" },
        { id: "S2", name: "Cloud Computing" },
        { id: "S3", name: "Cryptography and Network Security" },
        { id: "S4", name: "Cyber Security" },
        { id: "S5", name: "Computer Graphics" },
        { id: "S6", name: "Technical paper writing" },
        { id: "S7", name:"Academic writing and Public speaking"}
      ];

      subjectsData.forEach(s => {
        batch.set(doc(db, "subjects", s.id), s);
      });

      // Seed real students from data file
      const sortedStudentData = [...studentData].sort((a, b) => a.regNo.localeCompare(b.regNo));
      
      const processedStudents = sortedStudentData.map((s, index) => {
        console.log(`Seeding student ${s.regNo}: DOB: ${s.dob}`);
        const hashedDob = bcrypt.hashSync(s.dob, 10);
        return {
          registrationNumber: s.regNo,
          name: s.name,
          branch: s.branch,
          year: "3rd",
          phoneNumber: "",
          dob: hashedDob,
          selections: {},
          isSubmitted: false,
          group: index < sortedStudentData.length / 2 ? "A" : "B"
        };
      });

      processedStudents.forEach(s => {
        batch.set(doc(db, "students", s.registrationNumber), s);
      });

      // Add a test admin student
      const adminHashedDob = bcrypt.hashSync("01-01-2000", 10);
      batch.set(doc(db, "students", "ADMIN"), {
        registrationNumber: "ADMIN",
        name: "Admin User",
        branch: "N/A",
        year: "N/A",
        phoneNumber: "0000000000",
        dob: adminHashedDob,
        selections: {},
        isSubmitted: false,
        group: "A"
      });

      // Create admin user record
      if (auth.currentUser) {
        batch.set(doc(db, "users", auth.currentUser.uid), {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          role: "admin"
        });
      }

      await batch.commit();
      toast.success("Database seeded successfully with 286 students!", { id: toastId });
    } catch (e: any) {
      toast.error(e.message, { id: toastId });
    } finally {
      setSeeding(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-transparent flex items-center justify-center font-mono text-[10px] font-bold uppercase tracking-[0.4em] text-slate-300 animate-pulse">
      Initializing_Admin_Session...
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent text-[#0f172a] p-6 relative overflow-hidden flex flex-col">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#7c3aed]/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />

      <div className="max-w-7xl mx-auto w-full space-y-8 relative z-10">
        {/* Top Navigation Bar */}
        <header className="glass-card p-6 rounded-[32px] flex flex-col md:flex-row justify-between items-center gap-6 relative z-30">
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
              <Shield size={24} className="text-[#7c3aed]" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Admin_Command_Center</h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">RGMCET_NODE_01 • Live_Sync_Active</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <button 
              onClick={toggleSelection}
              disabled={updatingSettings}
              className={`p-3 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${isSelectionEnabled ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
              title={isSelectionEnabled ? "Disable Selection" : "Enable Selection"}
            >
              {isSelectionEnabled ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
              <span className="hidden lg:inline">{isSelectionEnabled ? "Enabled" : "Disabled"}</span>
            </button>
            <button 
              onClick={() => navigate("/dashboard")}
              className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
              title="Portal View"
            >
              <BarChart3 size={18} />
              <span className="hidden lg:inline">Portal</span>
            </button>
            <button 
              onClick={() => document.getElementById('bulk-upload-input')?.click()}
              disabled={uploading || seeding}
              className="p-3 bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-20"
              title="Bulk Upload Students"
            >
              <Users size={18} />
              <span className="hidden lg:inline">{uploading ? "Uploading..." : "Bulk_Upload"}</span>
            </button>
            <input 
              id="bulk-upload-input"
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => document.getElementById('faculty-upload-input')?.click()}
              disabled={uploadingFaculty || seeding}
              className="p-3 bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-20"
              title="Bulk Upload Faculty"
            >
              <Users size={18} />
              <span className="hidden lg:inline">{uploadingFaculty ? "Uploading..." : "Faculty_Upload"}</span>
            </button>
            <input 
              id="faculty-upload-input"
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              onChange={handleFacultyUpload}
            />
            <button 
              onClick={() => setShowClearFacultyConfirm(true)}
              disabled={seeding || uploadingFaculty}
              className="p-3 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-20"
              title="Clear All Faculty"
            >
              <Trash2 size={18} />
              <span className="hidden lg:inline">Clear_Faculty</span>
            </button>
            <button 
              onClick={() => setShowClearStudentsConfirm(true)}
              disabled={seeding || uploading}
              className="p-3 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-20"
              title="Clear All Students"
            >
              <Trash2 size={18} />
              <span className="hidden lg:inline">Clear_Students</span>
            </button>
            <button 
              onClick={seedData}
              disabled={seeding || uploading}
              className="p-3 bg-slate-50 hover:bg-amber-50 text-slate-500 hover:text-amber-600 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-20"
              title="Seed Data"
            >
              <ShieldCheck size={18} />
              <span className="hidden lg:inline">{seeding ? "Seeding..." : "Seed"}</span>
            </button>
            <div className="relative group/reports">
              <button 
                className="p-3 bg-slate-50 hover:bg-[#7c3aed]/10 text-slate-500 hover:text-[#7c3aed] rounded-2xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
                title="Download Reports"
              >
                <Download size={18} />
                <span className="hidden lg:inline">Reports</span>
                <ChevronDown size={14} className="opacity-40" />
              </button>
              <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-slate-100 rounded-[32px] overflow-hidden hidden group-hover/reports:block z-50 shadow-2xl p-4 accent-glow">
                <div className="p-2 mb-3 text-[8px] font-bold uppercase tracking-widest text-slate-200 text-center border-b border-slate-50">Select_Target_Group</div>
                
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button 
                    onClick={() => setActiveReportGroup('A')}
                    className={`py-5 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all border flex flex-col items-center gap-2 ${activeReportGroup === 'A' ? 'bg-[#7c3aed] border-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/20' : 'bg-slate-50 border-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-900'}`}
                  >
                    <Users size={16} />
                    Group_A
                  </button>
                  <button 
                    onClick={() => setActiveReportGroup('B')}
                    className={`py-5 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all border flex flex-col items-center gap-2 ${activeReportGroup === 'B' ? 'bg-[#7c3aed] border-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/20' : 'bg-slate-50 border-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-900'}`}
                  >
                    <Users size={16} />
                    Group_B
                  </button>
                </div>
                
                <AnimatePresence mode="wait">
                  {activeReportGroup ? (
                    <motion.div 
                      key={activeReportGroup}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <div className="text-[8px] font-bold uppercase tracking-widest text-[#7c3aed] mb-2 px-2 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-[#7c3aed] animate-pulse" />
                        Download_Options: Group_{activeReportGroup}
                      </div>
                      <button 
                        onClick={() => downloadReport(activeReportGroup, 'excel')} 
                        className="w-full text-left p-4 bg-slate-50 hover:bg-emerald-50 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-slate-600 hover:text-emerald-600 transition-all flex items-center justify-between group/btn border border-transparent hover:border-emerald-100"
                      >
                        <span className="flex items-center gap-3">
                          <Download size={14} className="text-emerald-500" />
                          Excel_Spreadsheet
                        </span>
                      </button>
                      <button 
                        onClick={() => downloadReport(activeReportGroup, 'pdf')} 
                        className="w-full text-left p-4 bg-slate-50 hover:bg-red-50 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-slate-600 hover:text-red-600 transition-all flex items-center justify-between group/btn border border-transparent hover:border-red-100"
                      >
                        <span className="flex items-center gap-3">
                          <Download size={14} className="text-red-500" />
                          PDF_Document
                        </span>
                      </button>
                    </motion.div>
                  ) : (
                    <div className="py-6 text-center font-mono text-[8px] font-bold uppercase tracking-widest text-slate-200 italic border border-dashed border-slate-100 rounded-2xl">
                      Waiting_For_Selection...
                    </div>
                  )}
                </AnimatePresence>

                <div className="mt-4 pt-4 border-t border-slate-50">
                   <button onClick={exportCSV} className="w-full text-left p-3 hover:bg-slate-50 rounded-xl text-[9px] font-bold uppercase tracking-widest text-slate-300 hover:text-slate-900 transition-colors text-center flex items-center justify-center gap-2">
                     <Download size={12} />
                     Full_Registry_Export_(CSV)
                   </button>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setShowResetConfirm(true)}
              className="p-3 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
              title="Reset All"
            >
              <RotateCcw size={18} />
              <span className="hidden lg:inline">Reset</span>
            </button>
            <button 
              onClick={() => auth.signOut()}
              className="p-3 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
              title="Logout"
            >
              <LogOut size={18} />
              <span className="hidden lg:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { label: "Total_Entities", value: students.length, icon: Users, color: "blue" },
            { label: "Submissions_Confirmed", value: students.filter(s => s.isSubmitted).length, icon: CheckCircle, color: "green" },
            { label: "Pending_Actions", value: students.filter(s => !s.isSubmitted).length, icon: Clock, color: "amber" }
          ].map((stat, i) => (
            <div key={i} className="glass-card p-8 rounded-[40px] relative overflow-hidden group">
              <div className="flex justify-between items-start mb-6">
                <div className={`w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center group-hover:bg-[#7c3aed]/20 transition-colors`}>
                  <stat.icon size={24} className="text-[#7c3aed]" />
                </div>
                <span className="text-4xl font-serif italic text-slate-100">{(i + 1).toString().padStart(2, '0')}</span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300 block mb-2">{stat.label}</span>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold tracking-tight">{stat.value.toString().padStart(3, '0')}</span>
                <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest">Units</span>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Student Directory */}
          <div className="lg:col-span-2 glass-card rounded-[48px] overflow-hidden flex flex-col">
            <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Entity_Directory</h2>
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mt-1">Registry_Monitoring_Service</p>
              </div>
              <div className="relative w-full md:w-72">
                <input
                  type="text"
                  placeholder="SEARCH_REGISTRY..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 pl-12 font-mono text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:border-[#7c3aed]/50 transition-all text-slate-900 placeholder:text-slate-300"
                />
                <Search className="w-4 h-4 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                    <th className="px-8 py-5 font-bold">Identification_No</th>
                    <th className="px-8 py-5 font-bold">Entity_Name</th>
                    <th className="px-8 py-5 font-bold">Group</th>
                    <th className="px-8 py-5 font-bold">Dept_Branch</th>
                    <th className="px-8 py-5 font-bold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-24 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-slate-200">
                        No_Records_Found_In_Local_Buffer
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.slice(0, 50).map((student) => (
                      <tr key={student.registrationNumber} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-5 font-mono text-[11px] font-bold text-slate-400">{student.registrationNumber}</td>
                        <td className="px-8 py-5 font-bold text-sm tracking-tight">{student.name}</td>
                        <td className="px-8 py-5">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${student.group === 'A' ? 'bg-blue-500/10 text-blue-600' : 'bg-purple-500/10 text-purple-600'}`}>
                            Group_{student.group}
                          </span>
                        </td>
                        <td className="px-8 py-5 font-mono text-[10px] font-bold text-slate-300">{student.branch}</td>
                        <td className="px-8 py-5 text-center">
                          {student.isSubmitted ? (
                            <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-600 rounded-full font-mono text-[9px] font-bold uppercase tracking-widest border border-green-500/20">
                              <div className="w-1 h-1 rounded-full bg-green-500" />
                              Confirmed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 text-slate-400 rounded-full font-mono text-[9px] font-bold uppercase tracking-widest border border-slate-200">
                              <div className="w-1 h-1 rounded-full bg-slate-200" />
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filteredStudents.length > 50 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50/20 text-center font-mono text-[8px] font-bold uppercase tracking-widest text-slate-300">
                Buffer_Overflow: Showing first 50 entries. Refine search parameters.
              </div>
            )}
          </div>

          {/* Faculty Monitoring */}
          <div className="glass-card rounded-[48px] overflow-hidden flex flex-col">
            <div className="p-8 border-b border-slate-50 bg-slate-50/30">
              <h2 className="text-2xl font-bold tracking-tight">Load_Balancer</h2>
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mt-1">Faculty_Allocation_Metrics</p>
            </div>
            
            <div className="p-8 space-y-4 overflow-y-auto max-h-[650px] custom-scrollbar">
              {faculty.map(f => (
                <div key={f.id} className="p-5 rounded-3xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-bold text-sm tracking-tight leading-none">{f.name}</p>
                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-widest ${f.group === 'A' ? 'bg-blue-500/10 text-blue-600' : 'bg-purple-500/10 text-purple-600'}`}>
                          G_{f.group}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">{subjects.find(s => s.id === f.subjectId)?.name}</p>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono text-[11px] font-bold ${f.studentCount >= 70 ? "text-red-500" : "text-slate-400"}`}>
                        {f.studentCount.toString().padStart(2, '0')}/70
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-700 ${f.studentCount >= 70 ? "bg-red-500" : "bg-[#7c3aed]"}`}
                      style={{ width: `${(f.studentCount / 70) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-12 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300">
          <div className="flex items-center gap-4">
            <span>© 2026 RGMCET_SYS</span>
            <div className="w-1 h-1 rounded-full bg-slate-200" />
            <span>Terminal_ID: {Math.random().toString(36).substring(7).toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-8">
            <span>Latency: 12ms</span>
            <span>V2.0.4_STABLE</span>
          </div>
        </footer>
      </div>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-card p-12 rounded-[48px] max-w-md w-full text-center relative accent-glow"
            >
              <div className="w-20 h-20 bg-red-500/20 rounded-[32px] flex items-center justify-center mx-auto mb-8">
                <AlertCircle size={40} className="text-red-500" />
              </div>
              <h3 className="text-3xl font-bold tracking-tight mb-4">Confirm_Purge</h3>
              <p className="text-slate-500 mb-12 leading-relaxed">
                Warning: This operation will purge all student selection buffers and reset load balancers to zero. This action is irreversible.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-8 py-5 rounded-3xl font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all"
                >
                  Abort
                </button>
                <button 
                  onClick={resetAll}
                  className="flex-1 px-8 py-5 rounded-3xl font-bold uppercase tracking-widest bg-red-500 text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Execute
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear Faculty Confirmation Modal */}
      <AnimatePresence>
        {showClearFacultyConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-card p-12 rounded-[48px] max-w-md w-full text-center relative accent-glow"
            >
              <div className="w-20 h-20 bg-red-500/20 rounded-[32px] flex items-center justify-center mx-auto mb-8">
                <Trash2 size={40} className="text-red-500" />
              </div>
              <h3 className="text-3xl font-bold tracking-tight mb-4">Clear_Faculty</h3>
              <p className="text-slate-500 mb-12 leading-relaxed">
                Warning: This will delete ALL faculty records from the system. You will need to re-upload your faculty list.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowClearFacultyConfirm(false)}
                  className="flex-1 px-8 py-5 rounded-3xl font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all"
                >
                  Abort
                </button>
                <button 
                  onClick={clearAllFaculty}
                  className="flex-1 px-8 py-5 rounded-3xl font-bold uppercase tracking-widest bg-red-500 text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Confirm_Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear Students Confirmation Modal */}
      <AnimatePresence>
        {showClearStudentsConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[100] p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-card p-12 rounded-[48px] max-w-md w-full text-center relative accent-glow"
            >
              <div className="w-20 h-20 bg-red-500/20 rounded-[32px] flex items-center justify-center mx-auto mb-8">
                <ShieldAlert size={40} className="text-red-500" />
              </div>
              <h3 className="text-3xl font-bold tracking-tight mb-4">Clear_All_Students</h3>
              <p className="text-slate-500 mb-12 leading-relaxed">
                Are you sure you want to delete ALL student records? This will also remove their selections and cannot be undone.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowClearStudentsConfirm(false)}
                  className="flex-1 px-8 py-5 rounded-3xl font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={clearAllStudents}
                  className="flex-1 px-8 py-5 rounded-3xl font-bold uppercase tracking-widest bg-red-500 text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Delete_All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}
