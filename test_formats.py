#!/usr/bin/env python3
"""
Test script to debug YouTube format issues
"""

import yt_dlp

def test_youtube_formats(url):
    """Test YouTube format availability"""
    print(f"🔍 Testing formats for: {url}")
    print("=" * 80)
    
    try:
        # Basic info extraction
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print("📥 Extracting video info...")
            info = ydl.extract_info(url, download=False)
            
            print(f"✅ Video title: {info.get('title', 'Unknown')}")
            print(f"✅ Video duration: {info.get('duration', 'Unknown')} seconds")
            print(f"✅ Available formats: {len(info.get('formats', []))}")
            
            # List all formats
            formats = info.get('formats', [])
            if formats:
                print(f"\n📊 Available formats:")
                print("-" * 80)
                print(f"{'Format ID':<10} {'Extension':<8} {'Quality':<15} {'Size':<10} {'Note':<20}")
                print("-" * 80)
                
                for fmt in formats:
                    format_id = fmt.get('format_id', 'N/A')
                    ext = fmt.get('ext', 'N/A')
                    quality = fmt.get('quality_note', 'N/A')
                    filesize = fmt.get('filesize', 0)
                    note = fmt.get('format_note', '')
                    
                    if filesize:
                        size_str = f"{filesize / (1024*1024):.1f}MB"
                    else:
                        size_str = "N/A"
                    
                    print(f"{format_id:<10} {ext:<8} {quality:<15} {size_str:<10} {note:<20}")
                
                print("-" * 80)
                
                # Test specific format downloads
                print(f"\n🧪 Testing format compatibility...")
                test_formats = [
                    'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
                    'best[height<=720]/best[height<=480]/best',
                    'bestaudio/best',
                    'worst'
                ]
                
                for test_format in test_formats:
                    try:
                        print(f"   Testing: {test_format}")
                        test_opts = {
                            'format': test_format,
                            'outtmpl': 'test_%(format_id)s.%(ext)s',
                            'quiet': True,
                            'no_warnings': True,
                        }
                        
                        with yt_dlp.YoutubeDL(test_opts) as ydl:
                            ydl.download([url])
                        print(f"   ✅ {test_format} - SUCCESS")
                        break
                        
                    except Exception as e:
                        print(f"   ❌ {test_format} - FAILED: {str(e)[:100]}...")
                        continue
                        
            else:
                print("❌ No formats available")
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) != 2:
        print("Usage: python test_formats.py <youtube_url>")
        print("Example: python test_formats.py https://www.youtube.com/watch?v=V8G6UD_iWEw")
        sys.exit(1)
    
    url = sys.argv[1]
    test_youtube_formats(url)
