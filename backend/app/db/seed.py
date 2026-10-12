"""Idempotent seed: demo doctors, KB chunks, demo accounts.

Run from backend/:  python -m app.db.seed
Fails fast with a clear message when MONGO_URI is unset.
"""
import os
import sys
from datetime import datetime, timezone

HOURS = {"morning": ["09:00", "13:00"], "evening": ["17:00", "21:00"]}

DEMO_DOCTORS = [
    ("Dr. Ananya Rao", "demo.cardiology@ragnosis.example", "Cardiology", "Apollo Clinic, Bengaluru", 80000, "DR-DEMO1"),
    ("Dr. Vikram Mehta", "demo.endocrinology@ragnosis.example", "Endocrinology", "CityCare Hospital, Mumbai", 100000, "DR-DEMO2"),
    ("Dr. Sara Thomas", "demo.neurology@ragnosis.example", "Neurology", "NeuroLife Center, Chennai", 120000, "DR-DEMO3"),
    ("Dr. Arjun Nair", "demo.orthopedics@ragnosis.example", "Orthopedics", "Bone & Joint Clinic, Kochi", 70000, "DR-DEMO4"),
    ("Dr. Priya Sharma", "demo.dermatology@ragnosis.example", "Dermatology", "SkinKare, Delhi", 60000, "DR-DEMO5"),
    ("Dr. Rahul Verma", "demo.pediatrics@ragnosis.example", "Pediatrics", "KidsFirst Hospital, Hyderabad", 50000, "DR-DEMO6"),
    ("Dr. Kavita Iyer", "demo.gynecology@ragnosis.example", "Gynecology", "WomenCare Hospital, Pune", 90000, "DR-DEMO7"),
    ("Dr. Rohan Desai", "demo.general@ragnosis.example", "General Medicine", "CityCare Hospital, Mumbai", 50000, "DR-DEMO8"),
]

KB_CHUNKS = [
    ("kb-0001", "hemoglobin",
     "Haemoglobin (Hb) carries oxygen in red blood cells. Typical adult reference ranges are about "
     "13–17 g/dL for men and 12–15 g/dL for women, though labs vary slightly. A low value may suggest "
     "anaemia, which has many causes including iron deficiency; a high value can occur with dehydration or "
     "other conditions. Only a clinician can interpret a result in context.",
     "RAGnosis curated KB v1.0 — public clinical reference ranges"),
    ("kb-0002", "wbc",
     "The white blood cell (WBC) count measures infection-fighting cells. A common adult reference range is "
     "4,000–11,000 cells per microlitre. Higher counts often accompany infections or inflammation, while lower "
     "counts can follow certain medications or bone-marrow conditions. Trends across reports matter more than a "
     "single reading.",
     "RAGnosis curated KB v1.0 — public clinical reference ranges"),
    ("kb-0003", "platelets",
     "Platelets help blood clot. The usual adult range is 150,000–450,000 per microlitre (1.5–4.5 lakh/µL). "
     "Indian labs often report platelets in lakhs, so 2.5 lakhs equals 250,000/µL. Low platelets raise bleeding "
     "risk; very high counts need clinical review.",
     "RAGnosis curated KB v1.0 — public clinical reference ranges"),
    ("kb-0004", "ldl-cholesterol",
     "LDL cholesterol is often called 'bad' cholesterol because high levels are linked with artery plaque. "
     "Guidelines commonly treat below 100 mg/dL as optimal for high-risk individuals and below 130 mg/dL as "
     "near-optimal for others. Diet, exercise, and medication all influence it; targets are personal and set by "
     "a doctor.",
     "RAGnosis curated KB v1.0 — public clinical reference ranges"),
    ("kb-0005", "hdl-cholesterol",
     "HDL cholesterol is often called 'good' cholesterol. Higher values (above 40 mg/dL for men, above 50 mg/dL "
     "for women) are generally associated with better cardiovascular risk profiles. Regular aerobic exercise is "
     "one of the most reliable ways to raise it.",
     "RAGnosis curated KB v1.0 — public clinical reference ranges"),
    ("kb-0006", "triglycerides",
     "Triglycerides are fats carried in the blood. Fasting levels below 150 mg/dL are generally considered "
     "normal, 150–199 borderline high. They rise after meals, so fasting samples give the most comparable "
     "results. Persistently high values are a cardiovascular risk factor.",
     "RAGnosis curated KB v1.0 — public clinical reference ranges"),
    ("kb-0007", "tsh",
     "Thyroid-stimulating hormone (TSH) reflects thyroid function. A common adult reference range is about "
     "0.4–4.0 mIU/L. High TSH with low thyroid hormones suggests hypothyroidism; low TSH suggests "
     "hyperthyroidism. Thyroid panels are usually read together with T3 and T4, never from TSH alone.",
     "RAGnosis curated KB v1.0 — public clinical reference ranges"),
    ("kb-0008", "hba1c",
     "HbA1c (glycated haemoglobin) reflects average blood sugar over two to three months. Below 5.7% is "
     "generally normal, 5.7–6.4% indicates prediabetes, and 6.5% or above suggests diabetes by most guidelines. "
     "Unlike fasting glucose, it does not require fasting. Diagnosis always needs clinical confirmation.",
     "RAGnosis curated KB v1.0 — public clinical reference ranges"),
]


def seed():
    from app import create_app
    from app.auth.jwt_auth import hash_password
    from app.db import get_db, init_indexes

    app = create_app()
    with app.app_context():
        init_indexes()
        db = get_db()
        now = datetime.now(timezone.utc)
        pw_hash = hash_password("demo1234")

        for name, email, spec, hospital, fee, public_id in DEMO_DOCTORS:
            db.users.update_one(
                {"email": email},
                {
                    "$set": {
                        "name": name,
                        "role": "doctor",
                        "specialization": spec,
                        "hospital": hospital,
                        "doctor_id_public": public_id,
                        "working_hours": HOURS,
                        "consultation_fee_paise": fee,
                        "is_demo": True,
                    },
                    "$setOnInsert": {"password_hash": pw_hash, "created_at": now},
                },
                upsert=True,
            )

        cities = ["Bengaluru", "Mumbai", "Chennai", "Kochi", "Delhi", "Hyderabad", "Pune", "Mumbai"]
        for (name, email, spec, hospital, fee, public_id), city in zip(DEMO_DOCTORS, cities):
            db.suggested_doctors.update_one(
                {"name": name, "is_demo": True},
                {
                    "$set": {
                        "specialization": spec,
                        "hospital": hospital,
                        "city": city,
                        "fee_paise": fee,
                        "is_demo": True,
                    }
                },
                upsert=True,
            )

        for chunk_id, topic, text, source in KB_CHUNKS:
            db.kb_chunks.update_one(
                {"chunk_id": chunk_id},
                {"$set": {"topic": topic, "text": text, "source": source, "kb_version": "1.0"}},
                upsert=True,
            )

        demo_doctor = db.users.find_one({"email": "demo.doctor@ragnosis.example"})
        if not demo_doctor:
            demo_doctor = {
                "name": "Demo Doctor",
                "email": "demo.doctor@ragnosis.example",
                "role": "doctor",
                "specialization": "General Physician",
                "hospital": "RAGnosis Demo Clinic",
                "doctor_id_public": "DR-DEMO00",
                "working_hours": HOURS,
                "is_demo": True,
            }
            db.users.update_one(
                {"email": demo_doctor["email"]},
                {"$set": demo_doctor, "$setOnInsert": {"password_hash": pw_hash, "created_at": now}},
                upsert=True,
            )
            demo_doctor = db.users.find_one({"email": demo_doctor["email"]})

        db.users.update_one(
            {"email": "demo.patient@ragnosis.example"},
            {
                "$set": {"name": "Demo Patient", "role": "patient", "mobile": "9876543210"},
                "$setOnInsert": {"password_hash": pw_hash, "created_at": now},
            },
            upsert=True,
        )
        db.users.update_one(
            {"email": "demo.patient2@ragnosis.example"},
            {
                "$set": {"name": "Aarav Sharma", "role": "patient", "mobile": "9812345670"},
                "$setOnInsert": {"password_hash": pw_hash, "created_at": now},
            },
            upsert=True,
        )
        db.users.update_one(
            {"email": "demo.patient3@ragnosis.example"},
            {
                "$set": {"name": "Priya Nair", "role": "patient", "mobile": "9898989898"},
                "$setOnInsert": {"password_hash": pw_hash, "created_at": now},
            },
            upsert=True,
        )
        db.users.update_one(
            {"email": "demo.receptionist@ragnosis.example"},
            {
                "$set": {
                    "name": "Demo Receptionist",
                    "role": "receptionist",
                    "linked_doctor_id": demo_doctor["_id"],
                },
                "$setOnInsert": {"password_hash": pw_hash, "created_at": now},
            },
            upsert=True,
        )
        db.users.update_one(
            {"email": "demo.receptionist2@ragnosis.example"},
            {
                "$set": {
                    "name": "Demo Receptionist 2",
                    "role": "receptionist",
                    "linked_doctor_id": demo_doctor["_id"],
                },
                "$setOnInsert": {"password_hash": pw_hash, "created_at": now},
            },
            upsert=True,
        )
        print(f"Seed complete: {len(DEMO_DOCTORS)} specialty doctors + demo doctor, 8 KB chunks, "
              "3 demo patients, 2 demo receptionists (all passwords: demo1234).")


def main():
    if not os.environ.get("MONGO_URI"):
        print(
            "ERROR: MONGO_URI is not set. Copy backend/.env.example to backend/.env "
            "and add your MongoDB Atlas connection string.",
            file=sys.stderr,
        )
        sys.exit(1)
    seed()


if __name__ == "__main__":
    main()
