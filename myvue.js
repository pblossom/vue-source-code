const compileUtils = {
  getValue(expr, vm) {
    //处理msg 和person.name不同形式的不同方法，最终返回真正想要的value。
    return expr.split(".").reduce((data, currentVal) => {
      //console.log("data: ", data);
      //console.log("currentVal: ", data[currentVal]);
      return data[currentVal];
    }, vm.$data);
    //reduce函数，接收vm.$data作为初始值，例如要取到vm.$data.person.name，此时相当于[person,name].reduce(a,b)
    //先返回vm.$data.person,将它作为下一次执行的data，再执行数组第二个name作为currentVal，拿到data.name
    //此时就把msg 和person.name 的值用一个通用的方法取出。
  },
  text(el, expr, vm) {
    //expr:msg  person.name
    const value = this.getValue(expr, vm);
    this.updater.textUpdater(el, value);
  },
  html(el, expr, vm) {
    const value = this.getValue(expr, vm);
    //取到value:  <div>一个v-html</div> ,将value插入到文档碎片中即可
    this.updater.htmlUpdater(el, value);
  },
  model(el, expr, vm) {
    const value = this.getValue(expr, vm);
    this.updater.moduleUpdater(el, value);
  },
  on(el, expr, vm, eventName) {},

  updater: {
    //虽然可以在解析时直接对el进行操作，但将update操作抽离解耦更方便。
    textUpdater(el, value) {
      el.textContent = value;
    },
    htmlUpdater(el, value) {
      el.innerHTML = value;
    },
    modelUpdater(el, value) {
      el.value = value;
    },
  },
};

class Compile {
  constructor(el, vm) {
    this.el = this.isElementNode(el) ? el : document.querySelector(el);
    console.log("this", this.el);
    this.vm = vm;
    console.log("this.vm: ", this.vm);
    //1. 此处使用文档碎片对象来减少页面的回流和重绘。
    const fragment = this.node2fragment(this.el);
    console.log("fragment: ", fragment);

    //2. 编译模板（最重要的一步,解析指令）
    this.compile(fragment);
    //3.把文档碎片对象放入根元素。
    this.el.appendChild(fragment);
  }
  compile(fragment) {
    const childNodes = fragment.childNodes;
    [...childNodes].forEach((child) => {
      //childNodes和arguments类似，是类数组。将它转换成数组
      if (this.isElementNode(child)) {
        //是元素节点，编译元素节点
        //console.log("元素节点", child);
        this.compileElements(child);
        // let attr = child.attributes;
        // console.log("attr: ", attr);
      } else {
        //是文本节点，编译文本节点
        //console.log("其他节点", child);
        this.compileText(child);
      }
      if (child.childNodes && child.childNodes.length) {
        this.compile(child);
      }
    });
  }
  compileElements(node) {
    let attributes = node.attributes;
    [...attributes].forEach((attr) => {
      //console.log("attr:", attr); //v-text='msg' v-text='person.name' v-html=‘htmlMsg’ type v-on:click
      let { name, value } = attr; //name:v-text v-html v-model type  //value:msg person.name
      if (this.isDirective(name)) {
        //排除type，否则之后的处理中会报错。
        let [, directive] = name.split("-"); //text html on:click 需要进一步处理on:click
        //console.log("directive: ", directive);
        let [directName, eventName] = directive.split(":");
        //console.log("event: ", eventName);
        //console.log("directName: ", directName);
        //定义一个处理的类  接收参数：node? / value / vm /eventName (eventName是可选参数,放在最后)
        compileUtils[directName](node, value, this.vm, eventName);
      }
    });
  }
  compileText(node) {}

  isElementNode(node) {
    return node.nodeType === 1;
  }
  isDirective(attr) {
    return attr.startsWith("v-"); //一个字符串函数，注意是starts
  }

  node2fragment(el) {
    //创建文档碎片对象
    let fragment = document.createDocumentFragment();
    let node;
    while ((node = el.firstChild)) {
      fragment.appendChild(node); //appendChild自带删除功能。
    }
    return fragment;
  }
}

class Myvue {
  constructor(options) {
    this.el = options.el;
    this.$data = options.data();
    this.$options = options;

    if (this.el) {
      //获得el所在的dom节点，下一步进行指令解析。
      new Compile(this.el, this);
    }
  }
}
