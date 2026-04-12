#!/usr/bin/env python3
"""
Complete Backend Offload Script
Processes all files in a folder using the backend API
"""

import os
import requests
import json
import time
from pathlib import Path
from typing import List, Dict, Any

class BackendProcessor:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session = requests.Session()
        
    def check_health(self) -> bool:
        """Check if backend is healthy"""
        try:
            response = self.session.get(f"{self.base_url}/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Backend Status: {data['status']}")
                print(f"   Version: {data['version']}")
                print(f"   PDF Processing: {data['features']['pdf_processing']}")
                print(f"   Office Processing: {data['features']['office_processing']}")
                print(f"   Embeddings: {data['features']['embeddings']}")
                return True
            else:
                print(f"❌ Backend returned status {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Backend health check failed: {e}")
            return False
    
    def process_file(self, file_path: Path) -> Dict[str, Any]:
        """Process a single file using backend"""
        try:
            with open(file_path, 'rb') as f:
                files = {'file': (file_path.name, f, 'application/octet-stream')}
                response = self.session.post(
                    f"{self.base_url}/api/documents/process",
                    files=files,
                    timeout=300  # 5 minutes timeout
                )
                
            if response.status_code == 200:
                return response.json()
            else:
                print(f"❌ Failed to process {file_path.name}: HTTP {response.status_code}")
                print(f"   Response: {response.text}")
                return None
                
        except Exception as e:
            print(f"❌ Error processing {file_path.name}: {e}")
            return None
    
    def process_folder(
        self,
        folder_path: str,
        export_json_path: str | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Process all supported files in a folder.
        Returns a list of app-compatible document dicts.
        If export_json_path is set, writes that list to a JSON file for "Import CLI Output".
        """
        folder = Path(folder_path)
        if not folder.exists():
            print(f"❌ Folder not found: {folder_path}")
            return []
        
        supported_extensions = {
            '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.md'
        }
        
        files_to_process = []
        for file_path in folder.rglob('*'):
            if file_path.is_file() and file_path.suffix.lower() in supported_extensions:
                files_to_process.append(file_path)
        
        print(f"\n📁 Found {len(files_to_process)} supported files")
        print(f"📊 Total size: {sum(f.stat().st_size for f in files_to_process) / 1024 / 1024:.1f} MB")
        
        documents_for_app: List[Dict[str, Any]] = []
        success_count = 0
        error_count = 0
        total_chunks = 0
        start_time = time.time()
        try:
            folder_resolved = folder.resolve()
        except Exception:
            folder_resolved = folder
        
        for i, file_path in enumerate(files_to_process, 1):
            size_mb = file_path.stat().st_size / 1024 / 1024
            print(f"\n[{i}/{len(files_to_process)}] Processing: {file_path.name} ({size_mb:.1f} MB)")
            
            result = self.process_file(file_path)
            
            if result:
                success_count += 1
                total_chunks += result['total_chunks']
                full_text = "\n\n".join(c.get("text", "") for c in result.get("chunks", []))
                try:
                    rel_path = str(file_path.resolve().relative_to(folder_resolved))
                except Exception:
                    rel_path = str(file_path)
                documents_for_app.append({
                    "title": result.get("filename", file_path.name),
                    "content": full_text[:150000],
                    "source": "Backend Import",
                    "tags": ["backend-import"],
                    "drivePath": rel_path,
                })
                print(f"   ✅ Success: {result['total_chunks']} chunks in {result['processing_time_ms']:.0f}ms")
            else:
                error_count += 1
                print(f"   ❌ Failed to process")
        
        elapsed_time = time.time() - start_time
        print(f"\n📈 PROCESSING COMPLETE")
        print(f"   ✅ Successful: {success_count} files")
        print(f"   ❌ Failed: {error_count} files")
        print(f"   📄 Total chunks: {total_chunks}")
        print(f"   ⏱️  Total time: {elapsed_time:.1f} seconds")
        if files_to_process:
            print(f"   🚀 Average: {elapsed_time/len(files_to_process):.1f} seconds per file")
        
        if export_json_path and documents_for_app:
            out_path = Path(export_json_path)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump({"documents": documents_for_app}, f, ensure_ascii=False, indent=2)
            print(f"\n📄 Exported {len(documents_for_app)} documents to: {out_path}")
            print("   In the app, use Knowledge Base → Import CLI Output and select this file.")
        
        return documents_for_app

def main():
    """Main function"""
    print("🔧 Wrytica Backend Processor - Complete Offload Script")
    print("=" * 60)
    
    processor = BackendProcessor()
    
    if not processor.check_health():
        print("\n❌ Backend is not available. Please start the backend first:")
        print("   cd backend && python main.py")
        return
    
    folder_path = input("\n📂 Enter folder path to process: ").strip()
    if not folder_path:
        folder_path = r"F:\code project\Kimi_Agent_DealForge AI PRD\Knowledge managerment\Finance knowledge base"
        print(f"Using default: {folder_path}")
    
    export_path = input("📄 Export JSON for app import? (path or Enter to skip): ").strip()
    
    processor.process_folder(folder_path, export_json_path=export_path or None)
    
    print("\n✅ All done! Use 'Import CLI Output' in the app to load the exported JSON.")

if __name__ == "__main__":
    main()
