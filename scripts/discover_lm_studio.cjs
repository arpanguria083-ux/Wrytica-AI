
async function discoverLMStudio(baseUrl = 'http://localhost:1234') {
  console.log(`🔍 Querying LM Studio at ${baseUrl}...`);
  
  try {
    const response = await fetch(`${baseUrl}/v1/models`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('\n✅ Connection Successful!');
    
    if (data.data && data.data.length > 0) {
        console.log(`\nFound ${data.data.length} model(s):`);
        data.data.forEach((model, index) => {
            console.log(`\n--- Model ${index + 1} ---`);
            console.log(`ID: ${model.id}`);
            console.log(`Object: ${model.object}`);
            console.log(`Owned By: ${model.owned_by}`);
            
            // LM Studio occasionally provides extra metadata in some versions
            if (model.context_length) {
                console.log(`Context Length: ${model.context_length} (Detected!)`);
            } else if (model.meta && model.meta.context_length) {
                console.log(`Context Length: ${model.meta.context_length} (Detected!)`);
            } else {
                console.log('Context Length: Not explicitly provided in metadata.');
                console.log('Hint: Check the "Server" tab in LM Studio to see the Load-time Context Window.');
            }
        });
    } else {
        console.log('No models found. Is a model loaded in LM Studio?');
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
        console.error(`❌ Connection Refused! Is LM Studio running on ${baseUrl}?`);
        console.error('Make sure "Local Server" is started in LM Studio.');
    } else {
        console.error('❌ Error:', error.message);
    }
  }
}

// Get baseUrl from command line or use default
const args = process.argv.slice(2);
const url = args[0] || 'http://localhost:1234';

discoverLMStudio(url);
