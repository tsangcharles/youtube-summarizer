# YouTube Video Summarizer - Embedded Version

This version of the YouTube Video Summarizer extension injects the summary interface directly into YouTube pages instead of using a popup.

## Features

- **Integrated Interface**: The summary panel is embedded directly into the YouTube page layout
- **Positioned Above Recommendations**: Located above the video recommendations in the right sidebar
- **Pushes Down Content**: Integrates naturally with the page layout instead of overlaying content
- **Collapsible**: Click the `−` button to collapse/expand the panel
- **Real-time Updates**: Shows progress and status updates as the summary is generated
- **Cached Results**: Automatically loads cached summaries when available

## How It Works

1. **Automatic Detection**: The extension automatically detects when you're on a YouTube video page
2. **Panel Integration**: A summary panel is injected into the right sidebar above video recommendations
3. **Natural Layout**: The panel pushes down all content below it, maintaining the page's natural flow
4. **Video Info Display**: Shows the current video title and ID
5. **One-Click Summarization**: Click the "Generate Summary" button to start the process
6. **Real-time Progress**: Watch the progress bar and status updates as the summary is generated
7. **Results Display**: View the generated summary with copy and save options

## Installation

1. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `chrome_extension` folder

2. Make sure your Python backend server is running:
   ```bash
   cd /path/to/youtube_summary
   python server.py
   ```

3. Navigate to any YouTube video page
4. The summary panel will automatically appear above the video recommendations

## Usage

1. **Navigate to a YouTube video**
2. **Wait for the panel to load** (shows video info)
3. **Click "Generate Summary"** to start the process
4. **Monitor progress** through the status updates and progress bar
5. **View results** in the embedded panel
6. **Copy or save** the summary using the action buttons

## Panel Features

- **Header**: Shows "🎥 AI Summary" with a collapse/expand toggle
- **Video Info**: Displays current video title and ID
- **Generate Button**: Red button to start summarization
- **Progress Bar**: Visual indicator of processing progress
- **Status Text**: Current operation status
- **Log**: Scrollable log of all status updates
- **Results**: Formatted summary with copy/save options

## Technical Details

- **Content Script**: Injects the panel directly into YouTube's DOM structure
- **Layout Integration**: Panel is inserted into the secondary column (right sidebar)
- **Background Script**: Handles the summarization process
- **Storage**: Uses Chrome storage for caching and persistence
- **Styling**: Dark theme that matches YouTube's design
- **Responsive**: Panel adapts to different screen sizes and YouTube layouts

## Troubleshooting

- **Panel not appearing**: Refresh the page or check if the extension is enabled
- **Summarization fails**: Ensure your Python backend server is running
- **API errors**: Check your `.env` file for correct Gemini API key
- **Layout issues**: The panel integrates with YouTube's layout, so it should work with all themes and screen sizes

## Benefits of Embedded Version

- **Always visible**: No need to click the extension icon
- **Better UX**: See video info and start summarization immediately
- **Real-time updates**: Monitor progress without opening a popup
- **Persistent**: Panel stays visible as you navigate between videos
- **Integrated**: Feels like a natural part of the YouTube interface
- **Natural Layout**: Doesn't interfere with other page elements, pushes content down naturally
