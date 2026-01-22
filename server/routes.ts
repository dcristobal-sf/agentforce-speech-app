import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { agentforceClient } from "./agentforce";
import { speechFoundationsClient } from "./speech-foundations";
import { 
  insertConversationSchema, 
  insertTurnSchema, 
  insertSettingsSchema 
} from "@shared/schema";
import multer from "multer";
import fs from "fs";
import path from "path";

// Configure multer for audio file uploads
const upload = multer({
  dest: 'uploads/audio/',
  fileFilter: (req, file, cb) => {
    // Accept audio files with more flexible MIME type checking
    // This handles cases like 'audio/webm;codecs=opus'
    const isAudioFile = file.mimetype.startsWith('audio/') && 
      (file.mimetype.includes('wav') || 
       file.mimetype.includes('mp3') || 
       file.mimetype.includes('mpeg') || 
       file.mimetype.includes('webm') || 
       file.mimetype.includes('mp4') ||
       file.mimetype.includes('ogg') ||
       file.mimetype.includes('m4a') ||
       file.mimetype.includes('flac'));
       
    console.log('File filter check:', { mimetype: file.mimetype, accepted: isAudioFile });
    
    if (isAudioFile) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Conversations
  app.get('/api/conversations', async (req, res) => {
    try {
      const conversations = await storage.getConversations();
      res.json(conversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.post('/api/conversations', async (req, res) => {
    try {
      const conversationData = insertConversationSchema.parse(req.body);
      const conversation = await storage.createConversation(conversationData);
      res.json(conversation);
    } catch (error: any) {
      console.error('Error creating conversation:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid conversation data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create conversation' });
      }
    }
  });

  app.get('/api/conversations/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      res.json(conversation);
    } catch (error) {
      console.error('Error fetching conversation:', error);
      res.status(500).json({ error: 'Failed to fetch conversation' });
    }
  });

  app.get('/api/conversations/:id/turns', async (req, res) => {
    try {
      const { id } = req.params;
      const turns = await storage.getTurnsByConversation(id);
      res.json(turns);
    } catch (error) {
      console.error('Error fetching turns:', error);
      res.status(500).json({ error: 'Failed to fetch turns' });
    }
  });

  app.post('/api/conversations/:id/turns', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate that the conversation exists before creating a turn
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        console.log(`❌ Cannot create turn: Conversation ${id} not found`);
        return res.status(404).json({ 
          error: 'Conversation not found',
          message: `Cannot create turn for non-existent conversation: ${id}`
        });
      }
      
      console.log(`✓ Conversation ${id} exists, creating turn`);
      const turnData = insertTurnSchema.parse({ ...req.body, conversationId: id });
      const turn = await storage.createTurn(turnData);
      res.json(turn);
    } catch (error: any) {
      console.error('Error creating turn:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid turn data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create turn' });
      }
    }
  });

  // Speech-to-Text using Einstein Transcribe
  app.post('/api/stt', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      console.log('STT: Received file:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        filename: req.file.filename
      });

      // Read audio file
      const audioBuffer = fs.readFileSync(req.file.path);
      
      // Use Einstein Transcribe
      const transcription = await speechFoundationsClient.transcribeAudio(
        audioBuffer,
        req.file.mimetype,
        'spanish' // Default to Spanish, can be made configurable
      );

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({ 
        text: transcription,
        duration: 0 // Duration not available from Einstein Transcribe API
      });
    } catch (error) {
      console.error('Error transcribing audio:', error);
      // Clean up file even on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      // Provide detailed error message based on error type
      let errorMessage = 'Failed to transcribe audio';
      if (error instanceof Error) {
        if (error.message.includes('Invalid file format') || error.message.includes('400')) {
          errorMessage = 'Invalid audio format. Please try recording again.';
        } else if (error.message.includes('authentication') || error.message.includes('401')) {
          errorMessage = 'Audio transcription service unavailable. Please try again later.';
        } else if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
          errorMessage = 'Network timeout. Please check your connection and try again.';
        } else if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorMessage = 'Service temporarily busy. Please wait a moment and try again.';
        } else {
          errorMessage = `Transcription failed: ${error.message}`;
        }
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // Voice mapping for native Spanish (Spain) voices
  const voiceMapping: { [key: string]: string } = {
    // Native Spanish voices
    'mateo': 'wkuDMN1ptHyPzZcU37bK',   // Mateo - Middle-aged male, Spanish
    'hugo': 'UxLppKk2DHpPKLV59Lwo',    // Hugo - Middle-aged male, Spanish
    'martin': 'ccApat1nZq29MI9bwDPB',  // Martín - Young adult male, Spanish
    'julia': 'QPyKkS6G2o1razyQb3ks',   // Julia - Middle-aged female, Spanish (default)
    'paula': 'xCgyYk3lsaZoe5iRHTGb',   // Paula - Young adult female, Spanish
    'lucia': '5lyHt3pomylrlAK5VRjm',   // Lucía - Young adult female, Spanish
    // Legacy ElevenLabs voices (for compatibility)
    'matilda': 'XrExE9yKIg1WjnnlVkGX',
    'jessica': 'cgSgspJ2msm6clMCkdW9',
    'daniel': 'onwK4e9ZLuTAKqWW03F9',
    'rachel': '21m00Tcm4TlvDq8ikWAM',
    'antoni': 'ErXwobaYiN019PkySvjV',
    'arnold': 'VR6AewLTigWG4xSOukaG',
    'bella': 'EXAVITQu4vr4xnSDxMaL',
    'elli': 'MF3mGyEYCl7XYWbV9V6O'
  };


  // Text-to-Speech using Einstein Speech V2 with ElevenLabs voices
  app.get('/api/tts', async (req, res) => {
    try {
      const { text, voice = 'julia' } = req.query;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text is required' });
      }

      // Map voice name to Spanish voice ID
      const voiceId = voiceMapping[voice as string] || voiceMapping['julia'];
      
      // Use Einstein Speech to synthesize
      const audioBuffer = await speechFoundationsClient.synthesizeSpeech(text, voiceId);

      // Stream the audio response
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      });
      
      res.send(audioBuffer);
    } catch (error) {
      console.error('Error generating speech:', error);
      
      // Provide detailed error message based on error type
      let errorMessage = 'Failed to generate speech';
      if (error instanceof Error) {
        if (error.message.includes('authentication') || error.message.includes('401')) {
          errorMessage = 'Speech generation service unavailable. Please try again later.';
        } else if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
          errorMessage = 'Network timeout. Please check your connection and try again.';
        } else if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorMessage = 'Service temporarily busy. Please wait a moment and try again.';
        } else {
          errorMessage = `Speech generation failed: ${error.message}`;
        }
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });
  
  // Keep POST endpoint for backward compatibility
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voice = 'julia' } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      // Map voice name to Spanish voice ID
      const voiceId = voiceMapping[voice] || voiceMapping['julia'];
      
      // Use Einstein Speech to synthesize
      const audioBuffer = await speechFoundationsClient.synthesizeSpeech(text, voiceId);

      // Stream the audio response
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
      });
      
      res.send(audioBuffer);
    } catch (error) {
      console.error('Error generating speech:', error);
      
      // Provide detailed error message based on error type
      let errorMessage = 'Failed to generate speech';
      if (error instanceof Error) {
        if (error.message.includes('authentication') || error.message.includes('401')) {
          errorMessage = 'Speech generation service unavailable. Please try again later.';
        } else if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
          errorMessage = 'Network timeout. Please check your connection and try again.';
        } else if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorMessage = 'Service temporarily busy. Please wait a moment and try again.';
        } else {
          errorMessage = `Speech generation failed: ${error.message}`;
        }
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // Helper function to strip HTML tags for TTS
  function stripHtmlTags(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')           // Convert <br> to newlines
      .replace(/<\/p>/gi, '\n\n')              // Convert closing </p> to double newlines
      .replace(/<li[^>]*>/gi, '\n• ')          // Convert <li> to bullet points
      .replace(/<\/li>/gi, '')                 // Remove closing </li>
      .replace(/<[^>]+>/g, '')                 // Remove all other HTML tags
      .replace(/&nbsp;/g, ' ')                 // Convert &nbsp; to space
      .replace(/&amp;/g, '&')                  // Convert &amp; to &
      .replace(/&lt;/g, '<')                   // Convert &lt; to <
      .replace(/&gt;/g, '>')                   // Convert &gt; to >
      .replace(/&quot;/g, '"')                 // Convert &quot; to "
      .replace(/&#39;/g, "'")                  // Convert &#39; to '
      .replace(/\n\s*\n\s*\n/g, '\n\n')        // Collapse multiple newlines
      .trim();
  }

  // Helper function to process Agentforce response
  function processAgentforceResponse(rawResponse: string): { textForTts: string; textForUi: string; hasHtml: boolean } {
    try {
      // Try to parse as JSON to check for structured response
      const parsed = JSON.parse(rawResponse);

      // Check if response has the special data format with HTML
      if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
        const firstDataItem = parsed.data[0];
        if (firstDataItem.value && firstDataItem.value.promptResponse) {
          const htmlContent = firstDataItem.value.promptResponse;
          const plainMessage = parsed.message || '';

          // Combine plain message with HTML content for UI
          const combinedHtml = plainMessage
            ? `<p>${plainMessage}</p>\n${htmlContent}`
            : htmlContent;

          // Extract plain text for TTS
          const textForTts = plainMessage + '\n' + stripHtmlTags(htmlContent);

          console.log('📊 Detected structured response with HTML');
          console.log('TTS text preview:', textForTts.substring(0, 100) + '...');

          return {
            textForTts: textForTts.trim(),
            textForUi: combinedHtml,
            hasHtml: true
          };
        }
      }

      // If parsed but no special format, treat as plain text
      return {
        textForTts: rawResponse,
        textForUi: rawResponse,
        hasHtml: false
      };
    } catch (e) {
      // Not JSON, treat as plain text
      return {
        textForTts: rawResponse,
        textForUi: rawResponse,
        hasHtml: false
      };
    }
  }

  // Agentforce integration
  app.post('/api/agentforce', async (req, res) => {
    try {
      const { text, conversationId } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      if (!conversationId) {
        return res.status(400).json({ error: 'ConversationId is required' });
      }

      // Get the conversation to check for existing sessionId
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Call Agentforce API with session persistence
      const { response, sessionId } = await agentforceClient.chatWithAgentInConversation(
        text,
        conversation.sessionId || undefined
      );

      // Validate response is not undefined or empty
      if (!response || typeof response !== 'string' || response.trim() === '') {
        console.error('❌ Agent returned invalid response:', response);
        return res.status(500).json({
          error: 'Agent response invalid',
          details: 'The agent did not provide a valid text response'
        });
      }

      console.log('=== AGENT RESPONSE VALIDATED ===');
      console.log('Preview:', response.substring(0, 100) + '...');
      console.log('=== FULL RAW RESPONSE FROM AGENT START ===');
      console.log(response);
      console.log('=== FULL RAW RESPONSE FROM AGENT END ===');
      console.log('Response type:', typeof response);
      console.log('Response length:', response.length);

      // Try to parse and show structure
      try {
        const parsed = JSON.parse(response);
        console.log('=== PARSED JSON STRUCTURE START ===');
        console.log(JSON.stringify(parsed, null, 2));
        console.log('=== PARSED JSON STRUCTURE END ===');
        console.log('Has data array?', Array.isArray(parsed.data));
        if (parsed.data && parsed.data.length > 0) {
          console.log('=== FIRST DATA ITEM START ===');
          console.log(JSON.stringify(parsed.data[0], null, 2));
          console.log('=== FIRST DATA ITEM END ===');
        }
      } catch (e) {
        console.log('!!! Response is NOT valid JSON, treating as plain text');
      }

      // Process response to separate TTS and UI versions
      const processed = processAgentforceResponse(response);
      console.log('=== PROCESSED RESULT START ===');
      console.log('hasHtml:', processed.hasHtml);
      console.log('textForTts length:', processed.textForTts.length);
      console.log('textForUi length:', processed.textForUi.length);
      console.log('textForUi preview:', processed.textForUi.substring(0, 200));
      console.log('=== PROCESSED RESULT END ===');

      // Update conversation with sessionId if it's new or changed
      if (sessionId !== conversation.sessionId) {
        await storage.updateConversationSessionId(conversationId, sessionId);
      }

      res.json({
        text: processed.textForTts,        // Plain text for TTS
        textForUi: processed.textForUi,    // HTML or plain text for UI
        hasHtml: processed.hasHtml,        // Flag to indicate HTML content
        conversationId,
        sessionId // Include sessionId in response for debugging
      });
    } catch (error: any) {
      console.error('Error calling Agentforce:', error);
      res.status(500).json({
        error: 'Failed to get Agentforce response',
        details: error.message
      });
    }
  });

  // Settings
  app.get('/api/settings', async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const settingsData = insertSettingsSchema.parse(req.body);
      const settings = await storage.updateSettings(settingsData);
      res.json(settings);
    } catch (error) {
      console.error('Error updating settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
