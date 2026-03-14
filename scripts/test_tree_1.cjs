const fs = require('fs');

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function convertNodes(nodes, parentId = null) {
  if (!nodes || !Array.isArray(nodes)) return [];
  return nodes.map(node => {
    return {
      id: node.node_id || generateId(),
      title: node.title || 'Untitled Section',
      summary: node.summary || '',
      content: node.text || '',
      pageNumber: typeof node.start_index === 'number' ? node.start_index + 1 : undefined,
      parentId: parentId,
      children: convertNodes(node.nodes, node.node_id)
    };
  });
}

function flattenPageIndexNodes(nodes) {
  if (!nodes) return [];
  const result = [];
  function recurse(list) {
    for (const node of list) {
      result.push(node);
      if (node.children) recurse(node.children);
    }
  }
  recurse(nodes);
  return result;
}

const treePath = 'F:\\code project\\Kimi_Agent_DealForge AI PRD\\dealforge-ai\\backend\\pageindex_data\\trees\\30a6f370-a7a6-4e79-8c26-b0966c6163be_tree.json';

try {
    console.log('Reading tree...');
    const content = fs.readFileSync(treePath, 'utf8');
    console.log('Tree size:', content.length);
    const tree = JSON.parse(content);
    console.log('Tree parsed.');
    const converted = convertNodes(tree.nodes);
    console.log('Converted.');
    const flattened = flattenPageIndexNodes(converted);
    console.log('Flattened, count:', flattened.length);
    console.log('Test complete.');
} catch (err) {
    console.error('Error:', err);
}
