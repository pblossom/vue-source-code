const compileUtils = {
  getValue(expr, vm) {
    //console.log("expr", expr);
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
  setValue(expr, value, vm) {
    expr.split(".").reduce((data, currentVal, index, arr) => {
      if (index === arr.length - 1) {
        data[currentVal] = value;
        return;
      }
    }, vm.$data);
  },
  getContentValue(vm, expr) {
    //返回一个表达式的值

    let bbb = expr.replace(/\{\{(.+?)\}\}/g, (...match) => {
      val = this.getValue(match[1].trim(), vm);
      return val;
    });
    return bbb;
  },
  text(el, expr, vm) {
    //expr:msg  person.name {{}}
    //1.判断是不是插值表达式
    let value;
    let fn = this.updater["textUpdater"];
    if (/\{\{(.+?)\}\}/.test(expr)) {
      // console.log("expr: ", expr);  {{person.name}}-- {{person.age}}
      //{{}}
      value = expr.replace(/\{\{(.+?)\}\}/g, (...match) => {
        //console.log("match: ", match);
        new Watcher(vm, match[1].trim(), () => {
          let aaa = this.getContentValue(vm, expr);
          fn(el, this.getContentValue(vm, expr));
        });
        return this.getValue(match[1].trim(), vm);
      });
    } else {
      new Watcher(vm, expr, (newVal) => {
        fn(el, newVal);
      });
      value = this.getValue(expr, vm);
    }
    fn(el, value);
  },
  html(el, expr, vm) {
    const value = this.getValue(expr, vm);
    //取到value:  <div>一个v-html</div> ,将value插入到文档碎片中即可
    this.updater.htmlUpdater(el, value);
  },
  model(el, expr, vm) {
    const fn = this.updater["modelUpdater"];
    const value = this.getValue(expr, vm);

    //给输入框增加观察者，在数据变化时触发dom更新。
    new Watcher(vm, expr, (newVal) => {
      fn(el, newVal);
    });
    fn(el, value);

    //v-model还有视图驱动数据的功能，需要在节点上绑定事件
    el.addEventListener("input", (e) => {
      let value = e.target.value; //取到变化后的值，把值传递给vm的$data
      console.log("value: ", value);
      this.setValue(expr, value, vm);
    });
  },
  on(el, expr, vm, eventName) {
    //eventName:click
    const fn = vm.$options.methods && vm.$options.methods[expr]; //通过expr取得回调函数
    el.addEventListener(eventName, fn.bind(vm), false);
    //回调函数要把vm作为this绑定进去，如果不绑定，index.html里的this指向的就是compileUtils这个对象
    //但此处这么做有问题，使用时的this.number可以取得值是因为vue里把data挂载到了vm中
    //我们自己实现的方法没有这个步骤，所以this.number=undefined
  },
  bind(el, expr, vm, attrName) {
    //v-bind:src  bind情况比较多，需要区分不同属性。
  },

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
  //基类，指令解析器
  constructor(el, vm) {
    this.el = this.isElementNode(el) ? el : document.querySelector(el);
    // console.log("this", this.el);
    this.vm = vm;
    // console.log("this.vm: ", this.vm);
    //1. 此处使用文档碎片对象来减少页面的回流和重绘。
    const fragment = this.node2fragment(this.el);
    // console.log("fragment: ", fragment);

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
      } else {
        //是文本节点，编译文本节点
        //console.log("文本节点", child);
        this.compileText(child);
      }
      if (child.childNodes && child.childNodes.length) {
        this.compile(child);
      }
    });
  }
  compileElements(node) {
    //编译元素节点
    let attributes = node.attributes;
    [...attributes].forEach((attr) => {
      //console.log("attr:", attr); //v-text='msg' v-text='person.name' v-html=‘htmlMsg’ type v-on:click
      let { name, value } = attr; //name:v-text v-html v-model type  //value:msg person.name
      let directName, eventName;
      if (this.isDirective(name)) {
        //是v-指令
        //排除type，否则之后的处理中会报错。
        let [, directive] = name.split("-"); //text html on:click 需要进一步处理on:click
        //console.log("directive: ", directive);
        [directName, eventName] = directive.split(":");
        //console.log("event: ", eventName);
        //console.log("directName: ", directName);
      } else if (this.isSuger1(name)) {
        //是@语法糖 eventName=click
        directName = "on";

        [, eventName] = name.split("@");
      } else if (this.isSuger2(name)) {
        //是:语法糖 value=
        directName = "text";
        [, value] = name.split(":");
      } else {
        //type 这种不是指令的
        return;
      }

      //定义一个处理的类  接收参数：node? / value / vm /eventName (eventName是可选参数,放在最后)
      //用这个类去更新数据，完成数据=>视图
      compileUtils[directName](node, value, this.vm, eventName);

      //删除v-指令标签的attributes。
      node.removeAttribute("v-" + directName);
    });
  }
  compileText(node) {
    //编译{{}} 这里用正则解析
    let content = node.textContent;
    if (/\{\{(.+?)\}\}/.test(content)) {
      //console.log("node: ", node.textContent);
      compileUtils.text(node, content, this.vm);
    }
  }
  isElementNode(node) {
    return node.nodeType === 1;
  }
  isSuger1(attr) {
    return attr.startsWith("@"); //一个字符串函数，注意是starts
  }
  isSuger2(attr) {
    return attr.startsWith(":"); //一个字符串函数，注意是starts
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

class Observer {
  //实现数据劫持功能
  constructor(data) {
    console.log("data: ", data);
    //1.数据劫持,此处定义一个可以递归的函数。
    this.observer(data);
  }
  observer(data) {
    //此处如果不是对象就不观察。
    if (data && typeof data === "object") {
      //遍历对象的每个属性，加上get 和 set
      for (let key in data) {
        this.addReactive(data, key, data[key]);
      }
    }
  }
  addReactive(data, key, value) {
    this.observer(value); //将data里的内层对象也进行劫持，此处是递归调用。

    let dep = new Dep(); //为每个属性都加上发布订阅的功能，一个属性可以在页面中使用多次。
    Object.defineProperty(data, key, {
      get() {
        //为属性对应的观察者添加订阅,以便在set时发布通知
        // console.log(" Dep.target: ", Dep.target);
        Dep.target && dep.addSubs(Dep.target);
        return value;
      },
      set: (newValue) => {
        this.observer(newValue); //将实例完成后的调用也进行劫持，加上getter和setter
        value = newValue;
        //发布通知
        console.log("dep", dep);
        dep.notify();
      },
    });
  }
}
//发布订阅的类
// 1.一个数组包含订阅的所有watcher们。
// 2. 可以添加watcher
// 3.通知变化时调用每个watcher的update()
class Dep {
  constructor() {
    this.subs = [];
  }
  addSubs(watcher) {
    this.subs.push(watcher);
  }
  notify() {
    this.subs.forEach((watcher) => {
      watcher.update();
    });
  }
}

//观察者 （发布订阅） 观察者 被观察者
// 1.旧值 用vm和expr取到
// 2.新值 也用vm和expr取到
// 3.cb函数，在值变化时调用
// 4.update() 当观察到变化时，取新值，值不同时，调用callback

class Watcher {
  constructor(vm, expr, cb) {
    //先将值存储起来
    this.vm = vm;
    this.expr = expr;
    this.cb = cb;
    this.oldVal = this.getfirstVal(expr, vm);
  }
  getfirstVal(expr, vm) {
    Dep.target = this; //把自己这个观察者传出去到全局的Dep，在下一步get数据的时候会触发Observe的get方法。
    let value = compileUtils.getValue(expr, vm);
    Dep.target = null; //将target重置
    return value;
  }
  //当观察到变化时调用update函数
  update() {
    let newVal = compileUtils.getValue(this.expr, this.vm);
    if (this.oldVal !== newVal) {
      this.oldVal = newVal;
      this.cb(newVal);
    }
  }
}

class Myvue {
  constructor(options) {
    this.el = options.el;
    this.$data = options.data();
    this.$options = options;
    let computed = options.computed;

    if (this.el) {
      //实现数据劫持，将实例中的data全部转换成`Object.defineProperty()`定义
      new Observer(this.$data);

      //实现computed，实现方法与proxy类似
      for (let key in computed) {
        //key是计算属性里的函数名，通过函数名取函数体，绑定到vm上执行
        Object.defineProperty(this.$data, key, {
          get: () => {
            return computed[key].call(this);
          },
        });
      }

      // 把vm上的数据获取操作代理到vm.$data
      this.proxyVM(this.$data);

      //获得el所在的dom节点，下一步进行指令解析。
      new Compile(this.el, this);
    }
  }
  proxyVM(data) {
    for (let key in data) {
      Object.defineProperty(this, key, {
        get() {
          return data[key];
        },
      });
    }
  }
}
